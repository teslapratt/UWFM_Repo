import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

// Drop-in replacement for the sandboxed `window.storage` API the tracker
// component was originally written against, backed by a shared Firestore
// collection so all team members see the same data.
const COLLECTION = "kv";

window.storage = {
  async get(key) {
    const snap = await getDoc(doc(db, COLLECTION, key));
    return snap.exists() ? { value: snap.data().value } : null;
  },
  async set(key, value) {
    await setDoc(doc(db, COLLECTION, key), { value });
    return true;
  },
  async delete(key) {
    await deleteDoc(doc(db, COLLECTION, key));
    return true;
  },
};
