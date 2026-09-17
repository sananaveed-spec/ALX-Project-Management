import { NextResponse } from "next/server";
import {
  readProjectDetails,
  readProjectHistory,
  writeProjectDetails,
  writeProjectHistory,
} from "@/lib/data-store";
import {
  applyClearReminder,
  applyRescheduleReminder,
  filterTodayToDoRows,
  formatHistoryCommentDate,
  projectHistoryFromDetail,
} from "@/lib/project-history";

export const runtime = "nodejs";

export async function GET() {
  try {
    const projectDetails = await readProjectDetails();
    const todayToDo = filterTodayToDoRows(projectDetails);
    return NextResponse.json({ todayToDo, projectDetails });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load today to-do list.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type TodayToDoBody = {
  action?: "clear" | "reschedule";
  projectId?: string;
  comments?: string;
  newReminderDate?: string;
};

/**
 * clear = Excel clearReminderData (col A)
 * reschedule = Excel changeDate (col B)
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TodayToDoBody;
    const action = body.action;
    const projectId = body.projectId?.trim();
    const comments = (body.comments ?? "").trim();

    if (action !== "clear" && action !== "reschedule") {
      return NextResponse.json(
        { error: 'Expected action "clear" or "reschedule".' },
        { status: 400 },
      );
    }
    if (!projectId) {
      return NextResponse.json(
        { error: "Expected projectId." },
        { status: 400 },
      );
    }
    if (!comments) {
      return NextResponse.json(
        { error: "Actions taken / comments are required." },
        { status: 400 },
      );
    }

    const projectDetails = await readProjectDetails();
    const index = projectDetails.findIndex((row) => row.id === projectId);
    if (index < 0) {
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    }

    const current = projectDetails[index];
    let nextRow = current;
    let history = projectHistoryFromDetail(current, { comments });

    if (action === "reschedule") {
      const newReminderDate = (body.newReminderDate ?? "").trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newReminderDate)) {
        return NextResponse.json(
          { error: "Expected newReminderDate as YYYY-MM-DD." },
          { status: 400 },
        );
      }
      // Snapshot history before mutation (Excel appends current PROJECTS row).
      history = projectHistoryFromDetail(current, {
        comments,
        actionTaken: current.pmActionItems,
        actionTakenDate: current.pmActionItemsDate,
      });
      nextRow = applyRescheduleReminder(current, newReminderDate, comments);
    } else {
      history = projectHistoryFromDetail(current, {
        comments,
        actionTaken: current.pmActionItems,
        actionTakenDate: formatHistoryCommentDate(),
      });
      nextRow = applyClearReminder(current, comments);
    }

    const nextDetails = [...projectDetails];
    nextDetails[index] = nextRow;
    const nextHistory = [history, ...(await readProjectHistory())];

    await writeProjectDetails(nextDetails);
    await writeProjectHistory(nextHistory);

    return NextResponse.json({
      ok: true,
      projectDetail: nextRow,
      projectDetails: nextDetails,
      todayToDo: filterTodayToDoRows(nextDetails),
      history,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update today to-do item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
