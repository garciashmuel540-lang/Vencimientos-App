import Dexie from "dexie";
import { getDb } from "./db";
import { createAsyncCache } from "./async-cache";
import { createSearchIndex } from "./search-index";

const cache = createAsyncCache(async () => createSearchIndex(await getDb().catalog.toArray()));
let watching = false;

export function getCatalogSearchIndex() {
  if (!watching) {
    const db = getDb();
    const prefix = `idb://${db.name}/catalog/`;
    // Includes edits, imports, clear(), and changes from other tabs / workers.
    Dexie.on("storagemutated", (parts) => {
      if (Object.keys(parts).some((part) => part.startsWith(prefix))) cache.invalidate();
    });
    db.on("close", cache.invalidate);
    watching = true;
  }
  // Do not reuse a snapshot inside a transaction that may have uncommitted writes.
  if (Dexie.currentTransaction) {
    return getDb().catalog.toArray().then(createSearchIndex);
  }
  return cache.get();
}
