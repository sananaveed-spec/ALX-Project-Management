import { NextResponse } from "next/server";
import {
  readHolidays,
  readProjectDetails,
  readTodoEmailSchedule,
  writeTodoEmailSchedule,
} from "@/lib/data-store";
import {
  buildTodoEmailPlans,
  buildTodoEmailPreview,
  buildTodoEmailSlotContent,
  markTodoEmailScheduled,
  normalizeTodoEmailList,
  parseTodoEmailSlotKey,
  promoteDueTodoEmailEntries,
  resolveTodoEmailPreviewContent,
  shouldSendTodoEmail,
  TODO_EMAIL_FROM,
  TODO_EMAIL_TO,
  todoEmailSlotKey,
  withTodoEmailRecipients,
  withTodoEmailSelectedSlot,
  type TodoEmailKind,
} from "@/lib/todo-email";

export const runtime = "nodejs";

async function loadScheduleSnapshot() {
  const [holidays, scheduleRaw, projectDetails] = await Promise.all([
    readHolidays(),
    readTodoEmailSchedule(),
    readProjectDetails(),
  ]);

  const promoted = promoteDueTodoEmailEntries(scheduleRaw);
  const schedule = promoted.changed
    ? await writeTodoEmailSchedule(promoted.store)
    : scheduleRaw;

  return {
    holidays,
    schedule,
    projectDetails,
    upcoming: buildTodoEmailPreview(holidays, schedule),
  };
}

function resolvePreviewTarget(
  upcoming: ReturnType<typeof buildTodoEmailPreview>,
  scheduleSelectedSlotKey: string,
  dateKeyParam: string,
  kind: TodoEmailKind,
) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKeyParam)) {
    return { dateKey: dateKeyParam, kind };
  }
  const saved = parseTodoEmailSlotKey(scheduleSelectedSlotKey);
  if (
    saved &&
    upcoming.some((row) => row.slotKey === scheduleSelectedSlotKey)
  ) {
    return saved;
  }
  if (upcoming[0]) {
    return { dateKey: upcoming[0].dateKey, kind: upcoming[0].kind };
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const snapshot = await loadScheduleSnapshot();
    const url = new URL(request.url);
    const dateKeyParam = url.searchParams.get("dateKey")?.trim() ?? "";
    const kindParam = url.searchParams.get("kind");
    const kind: TodoEmailKind =
      kindParam === "pending30" ? "pending30" : "today";

    const previewTarget = resolvePreviewTarget(
      snapshot.upcoming,
      snapshot.schedule.selectedSlotKey,
      dateKeyParam,
      kind,
    );

    let schedule = snapshot.schedule;
    if (previewTarget) {
      const slotKey = todoEmailSlotKey(
        previewTarget.dateKey,
        previewTarget.kind,
      );
      if (schedule.selectedSlotKey !== slotKey) {
        schedule = await writeTodoEmailSchedule(
          withTodoEmailSelectedSlot(schedule, slotKey),
        );
      }
    }

    const preview = previewTarget
      ? resolveTodoEmailPreviewContent(
          snapshot.projectDetails,
          schedule,
          previewTarget.dateKey,
          previewTarget.kind,
        )
      : null;

    const todayDecision = shouldSendTodoEmail(snapshot.holidays);
    const todayPreview =
      todayDecision.kind != null
        ? {
            dateKey: todayDecision.dateKey,
            kind: todayDecision.kind,
            ...buildTodoEmailSlotContent(
              snapshot.projectDetails,
              todayDecision.kind,
              todayDecision.dateKey,
            ),
          }
        : null;

    return NextResponse.json({
      from: schedule.from || TODO_EMAIL_FROM,
      to: schedule.to || TODO_EMAIL_TO,
      selectedSlotKey: schedule.selectedSlotKey,
      entries: schedule.entries,
      lastRun: schedule.lastRun,
      todayDecision,
      todayPreview,
      upcoming: buildTodoEmailPreview(snapshot.holidays, schedule),
      preview,
      mode: "live-cron",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load to-do email schedule.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PostBody = {
  action?: "ensure" | "mark" | "save-to";
  dateKey?: string;
  kind?: TodoEmailKind;
  scheduledFor?: string;
  subject?: string;
  rowCount?: number;
  to?: string;
  from?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as PostBody;
    const action =
      body.action === "mark"
        ? "mark"
        : body.action === "save-to"
          ? "save-to"
          : "ensure";

    if (action === "save-to") {
      const store = withTodoEmailRecipients(
        await readTodoEmailSchedule(),
        String(body.to ?? ""),
        String(body.from ?? ""),
      );
      const saved = await writeTodoEmailSchedule(store);
      const holidays = await readHolidays();
      return NextResponse.json({
        ok: true,
        from: saved.from,
        to: saved.to,
        upcoming: buildTodoEmailPreview(holidays, saved),
        message: "Saved From and To.",
      });
    }

    if (action === "mark") {
      const dateKey = String(body.dateKey ?? "").trim();
      const kind: TodoEmailKind =
        body.kind === "pending30" ? "pending30" : "today";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return NextResponse.json(
          { error: "dateKey (YYYY-MM-DD) is required." },
          { status: 400 },
        );
      }

      const scheduledFor = String(body.scheduledFor ?? "").trim();
      const sendAt = scheduledFor
        ? new Date(scheduledFor)
        : new Date(`${dateKey}T15:00:00+05:00`);
      if (Number.isNaN(sendAt.getTime())) {
        return NextResponse.json(
          { error: "scheduledFor must be a valid ISO timestamp." },
          { status: 400 },
        );
      }

      const current = await readTodoEmailSchedule();
      const next = markTodoEmailScheduled(current, {
        dateKey,
        kind,
        sendAt,
        subject: String(body.subject ?? "").trim(),
        rowCount: Number(body.rowCount) || 0,
        slotKey: todoEmailSlotKey(dateKey, kind),
      });
      const saved = await writeTodoEmailSchedule(next);
      const holidays = await readHolidays();

      return NextResponse.json({
        ok: true,
        to: saved.to,
        entries: saved.entries,
        upcoming: buildTodoEmailPreview(holidays, saved),
        message: "Marked as scheduled.",
      });
    }

    // ensure — FireFly style: live snapshot → Graph deferred send plans
    let schedule = await readTodoEmailSchedule();
    const toIncoming = String(body.to ?? "").trim();
    const fromIncoming = String(body.from ?? "").trim();
    if (toIncoming || fromIncoming) {
      schedule = withTodoEmailRecipients(
        schedule,
        toIncoming || schedule.to,
        fromIncoming || schedule.from,
      );
      schedule = await writeTodoEmailSchedule(schedule);
    }

    const [holidays, projectDetails] = await Promise.all([
      readHolidays(),
      readProjectDetails(),
    ]);
    const promoted = promoteDueTodoEmailEntries(schedule);
    if (promoted.changed) {
      schedule = await writeTodoEmailSchedule(promoted.store);
    }

    const upcoming = buildTodoEmailPreview(holidays, schedule);
    const plans = buildTodoEmailPlans(projectDetails, holidays, schedule);
    const recipients = normalizeTodoEmailList(schedule.to) || TODO_EMAIL_TO;

    return NextResponse.json({
      from: schedule.from || TODO_EMAIL_FROM,
      to: recipients,
      selectedSlotKey: schedule.selectedSlotKey,
      entries: schedule.entries,
      upcoming,
      plans: plans.map((plan) => ({
        dateKey: plan.dateKey,
        kind: plan.kind,
        slotKey: plan.slotKey,
        subject: plan.subject,
        html: plan.html,
        rowCount: plan.rowCount,
        sendAt: plan.sendAt.toISOString(),
      })),
      message:
        plans.length === 0
          ? "All upcoming to-do emails are already scheduled in Outlook."
          : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to prepare to-do email schedule.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
