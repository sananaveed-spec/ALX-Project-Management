import { NextResponse } from "next/server";
import {
  completedProjectFromDetail,
  normalizeCompletedProject,
  sortCompletedProjectsNewestFirst,
  type CompletedProjectEntry,
} from "@/lib/completed-projects";
import {
  readCompletedProjects,
  readProjectDetails,
  writeCompletedProjects,
  writeProjectDetails,
} from "@/lib/data-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const completedProjects = sortCompletedProjectsNewestFirst(
      await readCompletedProjects(),
    );
    return NextResponse.json({ completedProjects });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load completed projects.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Complete a PROJECTS row: append to Completed Projects and delete from Projects. */
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
        { error: "Project not found on Projects tab." },
        { status: 404 },
      );
    }

    const completed = completedProjectFromDetail(project);
    const completedProjects = sortCompletedProjectsNewestFirst([
      completed,
      ...(await readCompletedProjects()),
    ]);
    const remainingProjects = projectDetails.filter(
      (row) => row.id !== projectId,
    );

    await writeCompletedProjects(completedProjects);
    await writeProjectDetails(remainingProjects);

    return NextResponse.json({
      ok: true,
      completed,
      completedProjects,
      projectDetails: remainingProjects,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to complete project.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      completedProjects?: CompletedProjectEntry[];
    };
    if (!Array.isArray(body.completedProjects)) {
      return NextResponse.json(
        { error: "Expected { completedProjects: CompletedProjectEntry[] }." },
        { status: 400 },
      );
    }

    const completedProjects = sortCompletedProjectsNewestFirst(
      body.completedProjects
        .filter(
          (item): item is Partial<CompletedProjectEntry> & { id: string } =>
            typeof item === "object" &&
            item !== null &&
            typeof item.id === "string",
        )
        .map(normalizeCompletedProject),
    );

    await writeCompletedProjects(completedProjects);
    return NextResponse.json({ ok: true, completedProjects });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save completed projects.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
