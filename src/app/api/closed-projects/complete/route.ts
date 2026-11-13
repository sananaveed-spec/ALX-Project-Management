import { NextResponse } from "next/server";
import {
  detailFromClosedProject,
  sortClosedProjectsNewestFirst,
} from "@/lib/closed-projects";
import {
  completedProjectFromDetail,
  sortCompletedProjectsNewestFirst,
} from "@/lib/completed-projects";
import {
  readClosedProjects,
  readCompletedProjects,
  writeClosedProjects,
  writeCompletedProjects,
} from "@/lib/data-store";
import {
  isFullyInvoiced,
  isPartialOrFullInvoiced,
} from "@/lib/project-details";

export const runtime = "nodejs";

/**
 * Complete a Close Projects row → Completed Projects.
 * FULL / 100% allowed; open PARTIAL stays blocked.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { closedProjectId?: string };
    const closedProjectId = body.closedProjectId?.trim();
    if (!closedProjectId) {
      return NextResponse.json(
        { error: "Expected { closedProjectId: string }." },
        { status: 400 },
      );
    }

    const closedProjects = await readClosedProjects();
    const closed = closedProjects.find((row) => row.id === closedProjectId);
    if (!closed) {
      return NextResponse.json(
        { error: "Project not found on Close Projects." },
        { status: 404 },
      );
    }

    const detail = detailFromClosedProject(closed);
    const invoiced = detail.invoiced.trim().toUpperCase().replace(/\s+/g, " ");
    if (
      isPartialOrFullInvoiced(detail.invoiced) &&
      invoiced !== "FULL" &&
      !isFullyInvoiced(detail)
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot complete — project is still PARTIAL. Finish to FULL (100%), then complete; invoice history is copied to Completed Projects.",
        },
        { status: 409 },
      );
    }

    const completed = completedProjectFromDetail(detail);
    const nextCompleted = sortCompletedProjectsNewestFirst([
      completed,
      ...(await readCompletedProjects()),
    ]);
    const nextClosed = sortClosedProjectsNewestFirst(
      closedProjects.filter((row) => row.id !== closedProjectId),
    );

    await writeCompletedProjects(nextCompleted);
    await writeClosedProjects(nextClosed);

    return NextResponse.json({
      ok: true,
      completed,
      completedProjects: nextCompleted,
      closedProjects: nextClosed,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to complete closed project.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
