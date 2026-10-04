// ================================================================
//  FIREBASE — roster, scores, published maps.
//  Loaded lazily from Google's CDN. If Firebase can't be reached the
//  game still plays; scores just won't save.
//
//  Firestore layout
//    rosters/{schoolYear}   { periods: { "1st Period": ["Name", ...] } }
//    rosters/staff          { periods: { "Teachers": [...], "Peer Leaders": [...] } }
//    runs/{auto}            one finished game (see saveRun)
//    maps/{mapId}           { map: {...}, published: bool, updatedAt }
// ================================================================
import { FIREBASE_CONFIG, FIREBASE_SDK } from './config.js';

let fbPromise = null;

export function getFirebase() {
  if (!fbPromise) {
    fbPromise = (async () => {
      const [appMod, fsMod, authMod] = await Promise.all([
        import(`${FIREBASE_SDK}/firebase-app.js`),
        import(`${FIREBASE_SDK}/firebase-firestore.js`),
        import(`${FIREBASE_SDK}/firebase-auth.js`),
      ]);
      const app = appMod.initializeApp(FIREBASE_CONFIG);
      const db = fsMod.getFirestore(app);
      const auth = authMod.getAuth(app);
      return { app, db, auth, fs: fsMod, au: authMod };
    })();
    fbPromise.catch(() => { fbPromise = null; });
  }
  return fbPromise;
}

/** Students sign in anonymously so they can save scores. */
export async function ensureSignedIn() {
  const fb = await getFirebase();
  if (fb.auth.currentUser) return fb.auth.currentUser;
  await fb.auth.authStateReady?.();
  if (fb.auth.currentUser) return fb.auth.currentUser;
  const cred = await fb.au.signInAnonymously(fb.auth);
  return cred.user;
}

// ---------------------------------------------------------------- roster
export async function loadRosters() {
  const fb = await getFirebase();
  const { collection, getDocs } = fb.fs;
  const snap = await getDocs(collection(fb.db, 'rosters'));
  const years = {}; let staff = { periods: {} };
  snap.forEach(d => {
    const data = d.data() || {};
    if (d.id === 'staff') staff = { periods: data.periods || {} };
    else years[d.id] = { periods: data.periods || {}, updatedAt: data.updatedAt || null };
  });
  return { years, staff };
}

// ---------------------------------------------------------------- scores
export async function saveRun(entry) {
  const fb = await getFirebase();
  const user = await ensureSignedIn();
  const { addDoc, collection, serverTimestamp } = fb.fs;
  return addDoc(collection(fb.db, 'runs'), { ...entry, uid: user.uid, createdAt: serverTimestamp() });
}

export async function loadRuns(mapId, max = 300) {
  const fb = await getFirebase();
  const { collection, query, where, orderBy, limit, getDocs } = fb.fs;
  const q = query(collection(fb.db, 'runs'), where('mapId', '==', mapId), orderBy('score', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => !r.hidden);
}

// ---------------------------------------------------------------- maps
export async function loadPublishedMaps() {
  const fb = await getFirebase();
  const { collection, query, where, getDocs } = fb.fs;
  const snap = await getDocs(query(collection(fb.db, 'maps'), where('published', '==', true)));
  return snap.docs.map(d => d.data().map).filter(Boolean);
}

// ---------------------------------------------------------------- teacher
export async function teacherSignIn() {
  const fb = await getFirebase();
  const provider = new fb.au.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return fb.au.signInWithPopup(fb.auth, provider);
}

export async function signOut() {
  const fb = await getFirebase();
  return fb.au.signOut(fb.auth);
}

export async function onAuthChange(cb) {
  const fb = await getFirebase();
  return fb.au.onAuthStateChanged(fb.auth, cb);
}

export async function saveRoster(docId, periods) {
  const fb = await getFirebase();
  const { doc, setDoc, serverTimestamp } = fb.fs;
  return setDoc(doc(fb.db, 'rosters', docId), { periods, updatedAt: serverTimestamp() });
}

export async function deleteRoster(docId) {
  const fb = await getFirebase();
  return fb.fs.deleteDoc(fb.fs.doc(fb.db, 'rosters', docId));
}

export async function loadAllRuns(mapId) {
  const fb = await getFirebase();
  const { collection, query, where, orderBy, limit, getDocs } = fb.fs;
  const q = mapId
    ? query(collection(fb.db, 'runs'), where('mapId', '==', mapId), orderBy('score', 'desc'), limit(1000))
    : query(collection(fb.db, 'runs'), orderBy('createdAt', 'desc'), limit(1000));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function setRunHidden(id, hidden) {
  const fb = await getFirebase();
  return fb.fs.updateDoc(fb.fs.doc(fb.db, 'runs', id), { hidden });
}

export async function deleteRun(id) {
  const fb = await getFirebase();
  return fb.fs.deleteDoc(fb.fs.doc(fb.db, 'runs', id));
}

export async function loadAllMaps() {
  const fb = await getFirebase();
  const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, 'maps'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveMap(map, published) {
  const fb = await getFirebase();
  const { doc, setDoc, serverTimestamp } = fb.fs;
  return setDoc(doc(fb.db, 'maps', map.id), { map, published: !!published, updatedAt: serverTimestamp() });
}

export async function setMapPublished(id, published) {
  const fb = await getFirebase();
  return fb.fs.updateDoc(fb.fs.doc(fb.db, 'maps', id), { published: !!published });
}

export async function deleteMap(id) {
  const fb = await getFirebase();
  return fb.fs.deleteDoc(fb.fs.doc(fb.db, 'maps', id));
}
