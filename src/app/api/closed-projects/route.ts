import { NextResponse } from "next/server";
import {
  closedProjectFromDetail,
  normalizeClosedProject,
  sortClosedProjectsNewestFirst,
  type ClosedProjectEntry,
} from "@/lib/closed-projects";
import {
  readClosedProjects,
  readProjectDetails,
  writeClosedProjects,
  writeProjectDetails,
} from "@/lib/data-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const closedProjects = sortClosedProjectsNewestFirst(
      await readClosedProjects(),
    );
    return NextResponse.json({ closedProjects });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load closed projects.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Close an Active Projects row: append to Close Projects and remove from Active. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { projectId?: string };
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return NextResponse.json(
        { error: "Expected { projectId: string }." },
        { status: 400 },
      );
    }

    const projectDetails = await readProjectDetails();
    const project = projectDetails.find((row) => row.id === projectId);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found on Active Projects." },
        { status: 404 },
      );
    }

    const closed = closedProjectFromDetail(project);
    const closedProjects = sortClosedProjectsNewestFirst([
      closed,
      ...(await readClosedProjects()),
    ]);
    const remainingProjects = projectDetails.filter(
      (row) => row.id !== projectId,
    );

    await writeClosedProjects(closedProjects);
    await writeProjectDetails(remainingProjects);

    return NextResponse.json({
      ok: true,
      closed,
      closedProjects,
      projectDetails: remainingProjects,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to close project.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      closedProjects?: unknown;
    };
    if (!Array.isArray(body.closedProjects)) {
      return NextResponse.json(
        { error: "Expected { closedProjects: ClosedProjectEntry[] }." },
        { status: 400 },
      );
    }

    const closedProjects = sortClosedProjectsNewestFirst(
      body.closedProjects
        .filter(
          (item): item is Partial<ClosedProjectEntry> & { id: string } =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as { id?: unknown }).id === "string",
        )
        .map(normalizeClosedProject),
    );

    await writeClosedProjects(closedProjects);
    return NextResponse.json({ ok: true, closedProjects });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save closed projects.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
