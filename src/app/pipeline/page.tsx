import ClientPipelineWorkspace from "@/components/ClientPipelineWorkspace";

export default function PipelineRoute() {
  return (
    <div className="pb-6">
      <ClientPipelineWorkspace target="local" />
    </div>
  );
}
