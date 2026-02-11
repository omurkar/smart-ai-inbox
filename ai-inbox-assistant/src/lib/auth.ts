import type { User } from 'firebase/auth'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  reauthenticateWithPopup,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase'

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  const res = await signInWithPopup(auth, provider)
  return res.user
}

export async function signUpWithEmail(email: string, password: string) {
  const res = await createUserWithEmailAndPassword(auth, email, password)
  return res.user
}

export async function signInWithEmail(email: string, password: string) {
  const res = await signInWithEmailAndPassword(auth, email, password)
  return res.user
}

export async function signOutUser() {
  await signOut(auth)
}

export async function connectGmail(user: User) {
  const provider = new GoogleAuthProvider()
  provider.addScope('https://www.googleapis.com/auth/gmail.readonly')
  provider.addScope('https://www.googleapis.com/auth/gmail.send')
  // NEW: This scope is explicitly required to archive emails (modify labels)
  provider.addScope('https://www.googleapis.com/auth/gmail.modify')
  provider.setCustomParameters({ prompt: 'consent' })

  const res = await reauthenticateWithPopup(user, provider)
  const cred = GoogleAuthProvider.credentialFromResult(res)
  const accessToken = cred?.accessToken
  if (!accessToken) {
    throw new Error('No Google access token returned. Try again.')
  }
  return accessToken
}