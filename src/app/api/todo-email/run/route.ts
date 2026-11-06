import { NextResponse } from "next/server";
import {
  readHolidays,
  readProjectDetails,
  readTodoEmailSchedule,
  writeTodoEmailSchedule,
} from "@/lib/data-store";
import { sendGraphAppMail } from "@/lib/send-graph-app-mail";
import { reminderDaysOverdue } from "@/lib/project-history";
import {
  alreadySentTodoEmailToday,
  buildTodoEmailSlotContent,
  filterTodoEmailRows,
  normalizeTodoEmailList,
  shouldSendTodoEmail,
  TODO_EMAIL_FROM,
  TODO_EMAIL_TO,
  withTodoEmailLastRun,
  wrapTodoEmailHtmlDocument,
} from "@/lib/todo-email";

export const runtime = "nodejs";

function authorizeCron(request: Request): boolean {
  const secret = process.env.TODO_EMAIL_CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization")?.trim() ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const alt = request.headers.get("x-cron-secret")?.trim() ?? "";
  return bearer === secret || alt === secret;
}

/**
 * Live send at cron time: builds Today's / Friday Pending list from current
 * Active Projects, then Graph app-only sendMail as schedule.from.
 *
 * Auth: Authorization: Bearer $TODO_EMAIL_CRON_SECRET
 * Optional: ?force=1 to re-send even if already sent today.
 * Optional: ?dryRun=1 to preview selected rows without sending or updating lastRun.
 */
export async function POST(request: Request) {
  try {
    if (!authorizeCron(request)) {
      return NextResponse.json(
        {
          error:
            "Unauthorized. Set TODO_EMAIL_CRON_SECRET and pass Bearer token.",
        },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const dryRun = url.searchParams.get("dryRun") === "1";

    const [holidays, projectDetails, schedule] = await Promise.all([
      readHolidays(),
      readProjectDetails(),
      readTodoEmailSchedule(),
    ]);

    const decision = shouldSendTodoEmail(holidays);
    if (!decision.send || !decision.kind) {
      return NextResponse.json({
        ok: true,
        dryRun,
        skipped: true,
        dateKey: decision.dateKey,
        asOfDate: decision.asOfDate,
        reason: decision.reason,
      });
    }

    const content = buildTodoEmailSlotContent(
      projectDetails,
      decision.kind,
      decision.dateKey,
      decision.asOfDate,
    );
    const selectedRows = filterTodoEmailRows(
      projectDetails,
      decision.kind,
      decision.asOfDate,
    ).map((row) => {
      const daysDue = reminderDaysOverdue(row, decision.asOfDate);
      return {
        displayId: row.displayId,
        projectName: row.projectName,
        reminder: row.pmActionItems,
        reminderDate: row.pmActionItemsDate.trim().slice(0, 10),
        daysDue: daysDue === null ? null : daysDue,
      };
    });
    const to = normalizeTodoEmailList(schedule.to) || TODO_EMAIL_TO;
    const from = schedule.from.trim() || TODO_EMAIL_FROM;

    if (dryRun) {
      const alreadySent = alreadySentTodoEmailToday(
        schedule,
        decision.dateKey,
      );
      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldSend: !alreadySent || force,
        alreadySent,
        dateKey: decision.dateKey,
        asOfDate: decision.asOfDate,
        kind: decision.kind,
        subject: content.subject,
        rowCount: content.rowCount,
        to,
        from,
        reason: decision.reason,
        includeDaysDueColumn: decision.kind === "pending30",
        rows: selectedRows,
      });
    }

    if (!force && alreadySentTodoEmailToday(schedule, decision.dateKey)) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        dateKey: decision.dateKey,
        kind: decision.kind,
        reason: `Already sent for ${decision.dateKey}. Use ?force=1 to send again.`,
        lastRun: schedule.lastRun,
      });
    }

    await sendGraphAppMail({
      from,
      to,
      subject: content.subject,
      html: wrapTodoEmailHtmlDocument(content.html),
    });

    const lastRun = {
      dateKey: decision.dateKey,
      kind: decision.kind,
      sentAt: new Date().toISOString(),
      subject: content.subject,
      rowCount: content.rowCount,
      to,
    };
    const saved = await writeTodoEmailSchedule(
      withTodoEmailLastRun(schedule, lastRun),
    );

    return NextResponse.json({
      ok: true,
      skipped: false,
      dateKey: decision.dateKey,
      asOfDate: decision.asOfDate,
      kind: decision.kind,
      subject: content.subject,
      rowCount: content.rowCount,
      to,
      from,
      reason: decision.reason,
      lastRun: saved.lastRun,
      via: "graph-app-only",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to run to-do email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
