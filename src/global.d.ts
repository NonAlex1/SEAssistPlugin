// OfficeRuntime is injected by office.js at runtime but not in @types/office-js <1.0.
// Declare it minimally so TypeScript is happy.
declare namespace OfficeRuntime {
  const storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
}
