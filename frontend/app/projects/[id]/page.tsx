import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import ProjectWorkspaceView from "@/components/project-workspace-view";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = await params;

  // 1. Authenticate user server-side
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/projects/${encodeURIComponent(id)}`);
  }

  // 2. Fetch project with row-level security (RLS) enforcement
  // Queries execute under the caller's verified token; unowned or nonexistent rows return null.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, description, created_at, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (projectError || !project) {
    // Uniform 404 response to avoid cross-tenant existence disclosure
    notFound();
  }

  return (
    <ProjectWorkspaceView
      project={project}
      user={{
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      }}
    />
  );
}
