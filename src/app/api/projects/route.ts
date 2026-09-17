import { NextResponse } from "next/server";
import { readProjects, writeProjects } from "@/lib/data-store";
import { normalizeProject, type ProjectEntry } from "@/lib/projects";

export const runtime = "nodejs";

export async function GET() {
  try {
    const projects = await readProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load projects.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { projects?: ProjectEntry[] };
    if (!Array.isArray(body.projects)) {
      return NextResponse.json(
        { error: "Expected { projects: ProjectEntry[] }." },
        { status: 400 },
      );
    }

    const projects = body.projects
      .filter(
        (item): item is Partial<ProjectEntry> & { id: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof item.id === "string",
      )
      .map(normalizeProject);

    await writeProjects(projects);
    return NextResponse.json({ ok: true, projects });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save projects.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
