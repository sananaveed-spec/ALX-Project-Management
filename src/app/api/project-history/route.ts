import { NextResponse } from "next/server";
import {
  readProjectDetails,
  readProjectHistory,
  writeProjectDetails,
  writeProjectHistory,
} from "@/lib/data-store";
import {
  formatHistoryCommentDate,
  projectHistoryFromDetail,
} from "@/lib/project-history";
import { todayIsoInLosAngeles } from "@/lib/project-details";

export const runtime = "nodejs";

export async function GET() {
  try {
    const history = await readProjectHistory();
    return NextResponse.json({ history });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load project history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type ManualHistoryBody = {
  projectId?: string;
  comments?: string;
};

/**
 * Excel ManualHistoryupdate.gs (Log action):
 * Append PROJECTS snapshot → Project History
 * History Action Taken (J) ← comment, Date (K) ← today
 * PROJECTS Recent Activity (H) ← comment, Date (I) ← today
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ManualHistoryBody;
    const projectId = body.projectId?.trim();
    const comments = (body.comments ?? "").trim();

    if (!projectId) {
      return NextResponse.json(
        { error: "Expected projectId." },
        { status: 400 },
      );
    }
    if (!comments) {
      return NextResponse.json(
        { error: "Action / comment is required." },
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
    const todayIso = todayIsoInLosAngeles();
    const todayLabel = formatHistoryCommentDate();

    const historyEntry = projectHistoryFromDetail(current, {
      comments,
      actionTaken: comments,
      actionTakenDate: todayLabel,
    });

    const nextRow = {
      ...current,
      recentActivity: comments,
      recentActivityDate: todayIso,
    };

    const nextDetails = [...projectDetails];
    nextDetails[index] = nextRow;
    const nextHistory = [historyEntry, ...(await readProjectHistory())];

    await writeProjectDetails(nextDetails);
    await writeProjectHistory(nextHistory);

    return NextResponse.json({
      ok: true,
      history: nextHistory,
      historyEntry,
      projectDetail: nextRow,
      projectDetails: nextDetails,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to log project history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
