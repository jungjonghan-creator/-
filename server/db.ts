/** Cloudflare D1 와 호환되는 최소 DB 인터페이스. 운영=D1, 로컬/테스트=node:sqlite 어댑터(server/nodeDb.ts). */
export interface Stmt {
  bind(...v: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Db {
  prepare(sql: string): Stmt;
  /** 한 트랜잭션으로 실행: 하나라도 실패하면 전부 롤백 */
  batch(stmts: Stmt[]): Promise<unknown[]>;
}
