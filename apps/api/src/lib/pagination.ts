export function paginationParams(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginatedResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize };
}
