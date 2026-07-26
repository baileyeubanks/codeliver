type DemoServerEnvironment = {
  NODE_ENV?: string;
  CODELIVER_DEMO_MODE?: string;
};

type LocalDemoServerRequest = {
  host: string;
  demo: string | undefined;
  environment?: DemoServerEnvironment;
};

export function isLocalDemoServerRequest({
  host,
  demo,
  environment = process.env,
}: LocalDemoServerRequest): boolean {
  const hostname = host.split(":")[0]?.toLowerCase();
  const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  return (
    environment.NODE_ENV !== "production"
    && environment.CODELIVER_DEMO_MODE === "1"
    && localHost
    && demo === "1"
  );
}
