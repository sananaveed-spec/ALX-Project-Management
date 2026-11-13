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
import {
  isFullyInvoiced,
  isPartialOrFullInvoiced,
} from "@/lib/project-details";

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

    // FULL (or 100% invoiced) may complete — invoice dates copy onto Completed.
    // PARTIAL still mid-billing stays blocked so Invoicing History is not lost early.
    const invoiced = project.invoiced.trim().toUpperCase().replace(/\s+/g, " ");
    if (
      isPartialOrFullInvoiced(project.invoiced) &&
      invoiced !== "FULL" &&
      !isFullyInvoiced(project)
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot complete — project is still PARTIAL on Invoicing History. Finish to FULL (100%), then complete; invoice history is copied to Completed Projects.",
        },
        { status: 409 },
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
      completedProjects?: unknown;
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
            typeof (item as { id?: unknown }).id === "string",
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
