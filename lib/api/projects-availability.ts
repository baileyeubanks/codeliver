import {
  createContext,
  createElement,
  useContext,
  useEffect,
  type ReactNode,
} from "react";

export type ProjectsAvailabilityStatus = "loading" | "error" | "empty" | "success";
export type ProjectsFixture = "loading" | "error" | "empty";

export function normalizeProjectsFixture(value: string | null): ProjectsFixture | null {
  return value === "loading" || value === "error" || value === "empty"
    ? value
    : null;
}

export type ProjectsAvailabilityReport = {
  key: string;
  status: ProjectsAvailabilityStatus;
};

type ReportProjectsAvailability = (
  report: ProjectsAvailabilityReport | null,
) => void;

const ProjectsAvailabilityContext = createContext<ReportProjectsAvailability | null>(null);

export function projectsActionsUnavailable(
  pathname: string,
  expectedKey: string,
  report: ProjectsAvailabilityReport | null,
): boolean {
  return pathname === "/projects"
    && (report?.key !== expectedKey || report.status !== "success");
}

export function ProjectsAvailabilityReporter({
  report,
  children,
}: {
  report: ReportProjectsAvailability;
  children: ReactNode;
}) {
  return createElement(ProjectsAvailabilityContext.Provider, { value: report }, children);
}

export function useReportProjectsAvailability(
  key: string,
  status: ProjectsAvailabilityStatus,
) {
  const report = useContext(ProjectsAvailabilityContext);

  useEffect(() => {
    report?.({ key, status });
  }, [key, report, status]);

  useEffect(() => {
    if (!report) return;
    return () => report(null);
  }, [report]);
}
