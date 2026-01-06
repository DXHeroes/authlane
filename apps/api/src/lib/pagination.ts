/**
 * Pagination Helper Functions
 * Standardized pagination support for list endpoints
 */

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginationMetadata {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMetadata;
}

/**
 * Parse and validate pagination parameters
 *
 * @param limit - Maximum number of items to return
 * @param offset - Number of items to skip
 * @param maxLimit - Maximum allowed limit (default: 100)
 * @param defaultLimit - Default limit if not specified (default: 20)
 * @returns Validated pagination parameters
 */
export function parsePaginationParams(
  limit?: number,
  offset?: number,
  maxLimit = 100,
  defaultLimit = 20
): { limit: number; offset: number } {
  const validatedLimit = Math.min(Math.max(1, limit || defaultLimit), maxLimit);

  const validatedOffset = Math.max(0, offset || 0);

  return {
    limit: validatedLimit,
    offset: validatedOffset,
  };
}

/**
 * Create pagination metadata for a response
 *
 * @param total - Total number of items available
 * @param limit - Number of items requested
 * @param offset - Number of items skipped
 * @returns Pagination metadata
 */
export function createPaginationMetadata(
  total: number,
  limit: number,
  offset: number
): PaginationMetadata {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

/**
 * Create a paginated response
 *
 * @param data - Array of items
 * @param total - Total number of items available
 * @param limit - Number of items requested
 * @param offset - Number of items skipped
 * @returns Paginated response with metadata
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: createPaginationMetadata(total, limit, offset),
  };
}
