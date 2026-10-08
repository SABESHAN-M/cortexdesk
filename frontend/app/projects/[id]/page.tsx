export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex min-h-screen flex-col p-8">
      <h1 className="text-2xl font-bold">Project: {id}</h1>
    </div>
  );
}
