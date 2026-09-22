// Conservative byte ceiling for the ClamAV adapter. Admission and scanning must
// agree so an upload cannot consume storage only to fail an unavoidable limit.
export const CLAMAV_MAX_SCAN_BYTES = 2_000_000_000;
