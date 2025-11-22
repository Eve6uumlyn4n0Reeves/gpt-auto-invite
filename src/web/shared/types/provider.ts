// Lightweight shared types for provider/session related data
export interface ProviderUser {
  id: string
  email: string
}

export interface ProviderAccount {
  id: string
}

export interface ProviderSession {
  user: ProviderUser
  account: ProviderAccount
  accessToken: string
  expires: string // ISO timestamp
}

