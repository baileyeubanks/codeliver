import type { SupabaseClient } from "@supabase/supabase-js";
import { PortfolioAnalyticsError } from "./errors";
import {
  PORTFOLIO_LIMITS,
  type PortfolioAnalyticsPrincipal,
  type PortfolioAnalyticsQuery,
  type PortfolioAnalyticsSource,
  type PortfolioFileType,
  type PortfolioSnapshotBinding,
  type PortfolioVersionFact,
} from "./types";

interface ProjectRow {
  id: string;
  owner_id: string;
}

interface AssetRow {
  id: string;
  project_id: string;
  updated_at: string;
  file_type: PortfolioFileType;
}

interface VersionRow {
  id: string;
  asset_id: string;
  version_number: number;
  created_at: string;
  file_size: number | string | null;
  duration_seconds: number | null;
}

function sourceFailure(): never {
  throw new PortfolioAnalyticsError("SOURCE_FAILURE", "Portfolio analytics source unavailable", 502);
}

function resourceLimit(kind: string, max: number): never {
  throw new PortfolioAnalyticsError(
    "RESOURCE_LIMIT",
    `Portfolio query exceeds the ${max}-${kind} limit`,
    413,
  );
}

function bytes(value: VersionRow["file_size"]): string {
  if (value === null) return "0";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) sourceFailure();
    return value.toString();
  }
  if (!/^(0|[1-9]\d*)$/.test(value) || value.length > 40) sourceFailure();
  return BigInt(value).toString();
}

function durationMilliseconds(value: VersionRow["duration_seconds"]): string {
  if (value === null) return "0";
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 1_000) {
    sourceFailure();
  }
  return Math.round(value * 1_000).toString();
}

export class SupabasePortfolioAnalyticsSource implements PortfolioAnalyticsSource {
  constructor(private readonly client: SupabaseClient) {}

  private async assertProjectScope(
    principal: PortfolioAnalyticsPrincipal,
    query: PortfolioAnalyticsQuery,
  ): Promise<void> {
    const { data, error } = await this.client
      .from("projects")
      .select("id, owner_id")
      .eq("owner_id", principal.tenantId)
      .in("id", [...query.projectIds])
      .limit(PORTFOLIO_LIMITS.maxProjects);
    if (error) sourceFailure();
    const projects = (data ?? []) as ProjectRow[];
    const found = new Set(projects.map((project) => project.id));
    if (
      projects.some((project) => project.owner_id !== principal.tenantId) ||
      query.projectIds.some((projectId) => !found.has(projectId))
    ) {
      throw new PortfolioAnalyticsError("NOT_FOUND", "Portfolio scope not found", 404);
    }
  }

  private async loadAssets(
    principal: PortfolioAnalyticsPrincipal,
    query: PortfolioAnalyticsQuery,
    assetIds?: readonly string[],
  ): Promise<AssetRow[]> {
    if (assetIds && assetIds.length === 0) return [];
    let request = this.client
      .from("assets")
      .select("id, project_id, updated_at, file_type, projects!inner(owner_id)", { count: "exact" })
      .eq("projects.owner_id", principal.tenantId)
      .in("project_id", [...query.projectIds]);
    if (assetIds) request = request.in("id", [...assetIds]);
    if (query.filters.fileTypes) request = request.in("file_type", [...query.filters.fileTypes]);
    const { data, error, count } = await request.limit(PORTFOLIO_LIMITS.maxAssets + 1);
    if (error) sourceFailure();
    if ((count ?? (data ?? []).length) > PORTFOLIO_LIMITS.maxAssets) {
      resourceLimit("asset", PORTFOLIO_LIMITS.maxAssets);
    }
    return (data ?? []).map((row) => {
      const { projects: _projects, ...asset } = row as AssetRow & { projects: unknown };
      return asset;
    });
  }

  private toFacts(
    principal: PortfolioAnalyticsPrincipal,
    assets: readonly AssetRow[],
    versions: readonly VersionRow[],
  ): PortfolioVersionFact[] {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    return versions.map((version) => {
      const asset = byId.get(version.asset_id);
      if (!asset) {
        throw new PortfolioAnalyticsError(
          "SNAPSHOT_CONFLICT",
          "Snapshot facts are missing, stale, or changed",
          409,
        );
      }
      return {
        tenantId: principal.tenantId,
        projectId: asset.project_id,
        assetId: asset.id,
        assetUpdatedAt: asset.updated_at,
        fileType: asset.file_type,
        versionId: version.id,
        versionNumber: version.version_number,
        versionCreatedAt: version.created_at,
        fileSizeBytes: bytes(version.file_size),
        durationMilliseconds: durationMilliseconds(version.duration_seconds),
      };
    });
  }

  async loadCaptureFacts(
    principal: PortfolioAnalyticsPrincipal,
    query: PortfolioAnalyticsQuery,
  ): Promise<readonly PortfolioVersionFact[]> {
    await this.assertProjectScope(principal, query);
    const assets = await this.loadAssets(principal, query);
    if (assets.length === 0) return [];
    const { data, error, count } = await this.client
      .from("versions")
      .select("id, asset_id, version_number, created_at, file_size, duration_seconds", {
        count: "exact",
      })
      .in("asset_id", assets.map((asset) => asset.id))
      .gte("created_at", query.window.from)
      .lte("created_at", query.window.to)
      .lte("created_at", query.window.asOf)
      .order("created_at", { ascending: true })
      .limit(PORTFOLIO_LIMITS.maxFacts + 1);
    if (error) sourceFailure();
    if ((count ?? (data ?? []).length) > PORTFOLIO_LIMITS.maxFacts) {
      resourceLimit("fact", PORTFOLIO_LIMITS.maxFacts);
    }
    return this.toFacts(principal, assets, (data ?? []) as VersionRow[]);
  }

  async loadReplayFacts(
    principal: PortfolioAnalyticsPrincipal,
    query: PortfolioAnalyticsQuery,
    binding: PortfolioSnapshotBinding,
  ): Promise<readonly PortfolioVersionFact[]> {
    await this.assertProjectScope(principal, query);
    const versionIds = binding.facts.map((fact) => fact.versionId);
    if (versionIds.length === 0) return [];
    const { data, error } = await this.client
      .from("versions")
      .select("id, asset_id, version_number, created_at, file_size, duration_seconds")
      .in("id", versionIds)
      .limit(PORTFOLIO_LIMITS.maxFacts);
    if (error) sourceFailure();
    const versions = (data ?? []) as VersionRow[];
    const assetIds = [...new Set(versions.map((version) => version.asset_id))];
    const assets = await this.loadAssets(principal, query, assetIds);
    return this.toFacts(principal, assets, versions);
  }
}
