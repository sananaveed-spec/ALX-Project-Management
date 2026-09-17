import { NextResponse } from "next/server";
import { readProjectDetails, writeProjectDetails } from "@/lib/data-store";
import {
  normalizeProjectDetail,
  type ProjectDetailEntry,
} from "@/lib/project-details";

export const runtime = "nodejs";

export async function GET() {
  try {
    const projectDetails = await readProjectDetails();
    return NextResponse.json({ projectDetails });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load project details.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      projectDetails?: ProjectDetailEntry[];
    };
    if (!Array.isArray(body.projectDetails)) {
      return NextResponse.json(
        { error: "Expected { projectDetails: ProjectDetailEntry[] }." },
        { status: 400 },
      );
    }

    const projectDetails = body.projectDetails
      .filter(
        (item): item is Partial<ProjectDetailEntry> & { id: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof item.id === "string",
      )
      .map(normalizeProjectDetail);

    await writeProjectDetails(projectDetails);
    return NextResponse.json({ ok: true, projectDetails });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save project details.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Merge one project row into the current file.
 * Avoids full-array PUT races (e.g. Projects tab overwriting Today To-Do Done).
 */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      projectDetail?: Partial<ProjectDetailEntry> & { id?: string };
    };
    const incoming = body.projectDetail;
    if (
      !incoming ||
      typeof incoming !== "object" ||
      typeof incoming.id !== "string" ||
      !incoming.id.trim()
    ) {
      return NextResponse.json(
        { error: "Expected { projectDetail: { id, ... } }." },
        { status: 400 },
      );
    }

    const projectDetails = await readProjectDetails();
    const index = projectDetails.findIndex((row) => row.id === incoming.id);
    if (index < 0) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const nextRow = normalizeProjectDetail({
      ...projectDetails[index],
      ...incoming,
      id: incoming.id,
    });
    const nextDetails = [...projectDetails];
    nextDetails[index] = nextRow;
    await writeProjectDetails(nextDetails);

    return NextResponse.json({
      ok: true,
      projectDetail: nextRow,
      projectDetails: nextDetails,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update project detail.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
