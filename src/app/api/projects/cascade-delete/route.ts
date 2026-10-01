import { NextResponse } from "next/server";
import {
  applyCascadeDelete,
  findProjectDeleteBlockers,
  formatDeleteBlockedMessage,
} from "@/lib/cascade-delete-projects";
import {
  readCompletedProjects,
  readProjectDetails,
  readProjectHistory,
  readProjects,
  writeProjectDetails,
  writeProjects,
} from "@/lib/data-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { uniqueIds?: unknown };
    if (!Array.isArray(body.uniqueIds)) {
      return NextResponse.json(
        { error: "Expected { uniqueIds: string[] }." },
        { status: 400 },
      );
    }

    const uniqueIds = body.uniqueIds
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter(Boolean);

    if (uniqueIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one project to delete." },
        { status: 400 },
      );
    }

    const [naming, details, completed, history] = await Promise.all([
      readProjects(),
      readProjectDetails(),
      readCompletedProjects(),
      readProjectHistory(),
    ]);

    const blockers = findProjectDeleteBlockers({
      uniqueIds,
      details,
      completed,
      history,
    });
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error: formatDeleteBlockedMessage(blockers),
          blockers,
        },
        { status: 409 },
      );
    }

    const result = applyCascadeDelete({
      uniqueIds,
      naming,
      details,
      completed,
      history,
    });

    await Promise.all([
      writeProjects(result.namingRemaining),
      writeProjectDetails(result.detailsRemaining),
    ]);

    return NextResponse.json({
      ok: true,
      uniqueIds: result.uniqueIds,
      removed: result.removed,
      projects: result.namingRemaining,
      projectDetails: result.detailsRemaining,
      completedProjects: result.completedRemaining,
      history: result.historyRemaining,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete projects.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
