import { Timestamp } from "firebase-admin/firestore";

class Snapshot {
  constructor(id, value) {
    this.id = id;
    this.value = value;
    this.exists = value !== undefined;
    this.docs = undefined;
  }

  data() {
    return this.value;
  }
}

class Query {
  constructor(database, collection, filters = []) {
    this.database = database;
    this.collection = collection;
    this.filters = filters;
  }

  where(field, operator, expected) {
    return new Query(this.database, this.collection, [
      ...this.filters,
      [field, operator, expected],
    ]);
  }

  get() {
    const docs = [...this.database.records(this.collection)].flatMap(([id, value]) => {
      const matches = this.filters.every(([field, operator, expected]) => {
        const actual = value[field];
        if (operator === "==") return actual === expected;
        if (operator === ">") return actual?.toMillis?.() > expected.toMillis();
        return false;
      });
      return matches ? [new Snapshot(id, value)] : [];
    });
    const snapshot = new Snapshot(undefined, undefined);
    snapshot.docs = docs;
    return Promise.resolve(snapshot);
  }
}

class Collection extends Query {
  doc(id) {
    return { collection: this.collection, id };
  }
}

export class MemoryFirestore {
  constructor(seed = {}) {
    this.collections = new Map(
      Object.entries(seed).map(([name, records]) => [name, new Map(Object.entries(records))]),
    );
    this.transactionTail = Promise.resolve();
  }

  records(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return this.collections.get(name);
  }

  collection(name) {
    return new Collection(this, name);
  }

  async runTransaction(callback) {
    const previous = this.transactionTail;
    let release;
    this.transactionTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    const writes = [];
    const transaction = {
      get: (target) =>
        target instanceof Query
          ? target.get()
          : Promise.resolve(
              new Snapshot(target.id, this.records(target.collection).get(target.id)),
            ),
      update: (ref, value) => writes.push(["update", ref, value]),
      create: (ref, value) => writes.push(["create", ref, value]),
      set: (ref, value) => writes.push(["set", ref, value]),
    };

    try {
      const result = await callback(transaction);
      for (const [operation, ref, value] of writes) {
        const records = this.records(ref.collection);
        if (operation === "create" && records.has(ref.id)) {
          throw new Error("Document already exists.");
        }
        records.set(ref.id, {
          ...(operation === "update" ? records.get(ref.id) : {}),
          ...value,
        });
      }
      return result;
    } finally {
      release();
    }
  }
}
