import type {
  AuthenticatedSystemUserDto,
  AuthenticatedVenueUserDto,
  BlockedRuleDto,
  CreatedSystemUserDto,
  CreatedVenueDto,
  CreatedVenueUserDto,
  CreateSongRequestResponse,
  JoinVenueResponse,
  MusicSearchResponse,
  NearbyVenueDto,
  NowPlayingDto,
  PaginatedResponse,
  PasswordResetDto,
  PlayerLeaseDto,
  PlayerStateDto,
  QrCodeDto,
  QueueEntryDto,
  QueueUpdatedPayload,
  SongRequestDto,
  StatsPeriod,
  SystemSettingsResponse,
  SystemUserDto,
  SystemVenueDetailDto,
  SystemVenueDto,
  TopRequestDto,
  TopRequestsPeriod,
  VenueDetailDto,
  VenuePricingDto,
  VenueStatsDto,
  VenueUserDto,
} from '@moodisto/shared-types';
import type {
  CreateBlockedRuleInput,
  CreateQrCodeInput,
  CreateSongRequestInput,
  CreateSystemUserInput,
  CreateVenueInput,
  CreateVenueUserInput,
  SystemLoginInput,
  SystemSettingsUpdate,
  UpdateSystemUserInput,
  UpdateVenuePricingInput,
  UpdateVenueSettingsInput,
  UpdateVenueUserInput,
  VenueLoginInput,
} from '@moodisto/validation';
import { apiFetch } from './api-client';

/**
 * The application's view of the API, one function per endpoint.
 *
 * Components never build urls or bodies themselves: when a route changes, it changes here.
 */
export const publicApi = {
  joinByQr: (qrToken: string) =>
    apiFetch<JoinVenueResponse>(`/join/${encodeURIComponent(qrToken)}`, { method: 'POST' }),

  venue: (slug: string, signal?: AbortSignal) =>
    apiFetch<VenueDetailDto>(`/venues/${encodeURIComponent(slug)}`, { signal }),

  nowPlaying: (slug: string, signal?: AbortSignal) =>
    apiFetch<NowPlayingDto>(`/venues/${encodeURIComponent(slug)}/now-playing`, { signal }),

  queue: (slug: string, signal?: AbortSignal) =>
    apiFetch<readonly QueueEntryDto[]>(`/venues/${encodeURIComponent(slug)}/queue`, { signal }),

  topRequests: (slug: string, period: TopRequestsPeriod, limit = 10, signal?: AbortSignal) =>
    apiFetch<readonly TopRequestDto[]>(`/venues/${encodeURIComponent(slug)}/top`, {
      query: { period, limit },
      signal,
    }),

  nearby: (lat: number, lng: number, radiusMeters: number, signal?: AbortSignal) =>
    apiFetch<readonly NearbyVenueDto[]>('/venues/nearby', {
      query: { lat, lng, radiusMeters },
      signal,
    }),

  /**
   * Searches the tracks Moodisto already stores. Free, so every keystroke may use it.
   *
   * The provider key stays on the server; the browser only ever sees provider + track id.
   */
  search: (q: string, limit: number, venueId: string | undefined, signal: AbortSignal) =>
    apiFetch<MusicSearchResponse>('/music/search', { query: { q, limit, venueId }, signal }),

  /**
   * Searches the external provider, which costs the venue's daily allowance.
   *
   * Only ever called from an explicit tap, never from typing.
   */
  providerSearch: (q: string, limit: number, venueId: string | undefined, signal: AbortSignal) =>
    apiFetch<MusicSearchResponse>('/music/provider-search', {
      query: { q, limit, venueId },
      signal,
    }),

  createRequest: (slug: string, body: CreateSongRequestInput) =>
    apiFetch<CreateSongRequestResponse>(`/venues/${encodeURIComponent(slug)}/requests`, {
      method: 'POST',
      body,
    }),

  request: (requestId: string, signal?: AbortSignal) =>
    apiFetch<SongRequestDto>(`/requests/${encodeURIComponent(requestId)}`, { signal }),

  cancelRequest: (requestId: string) =>
    apiFetch<SongRequestDto>(`/requests/${encodeURIComponent(requestId)}/cancel`, {
      method: 'POST',
    }),

  myRequests: (slug: string, signal?: AbortSignal) =>
    apiFetch<readonly SongRequestDto[]>(`/venues/${encodeURIComponent(slug)}/my-requests`, {
      signal,
    }),

  /** Development-only checkout. A real PSP settles through its own signed webhook instead. */
  settleMockPayment: (providerPaymentId: string, status: 'PAID' | 'FAILED') =>
    apiFetch<{ received: true }>('/payments/mock/settle', {
      method: 'POST',
      body: { providerPaymentId, status },
    }),
};

export const authApi = {
  login: (body: VenueLoginInput) =>
    apiFetch<AuthenticatedVenueUserDto>('/auth/venue/login', { method: 'POST', body }),
  logout: () => apiFetch<{ ok: true }>('/auth/venue/logout', { method: 'POST' }),
  me: (signal?: AbortSignal) => apiFetch<AuthenticatedVenueUserDto>('/auth/venue/me', { signal }),
};

export const venueApi = {
  requests: (status: string | undefined, limit: number, signal?: AbortSignal) =>
    apiFetch<PaginatedResponse<SongRequestDto>>('/venue/requests', {
      query: { status, limit },
      signal,
    }),
  accept: (requestId: string) =>
    apiFetch<SongRequestDto>(`/venue/requests/${encodeURIComponent(requestId)}/accept`, {
      method: 'POST',
    }),
  reject: (requestId: string, reason: string | null) =>
    apiFetch<SongRequestDto>(`/venue/requests/${encodeURIComponent(requestId)}/reject`, {
      method: 'POST',
      body: { reason },
    }),

  queue: (signal?: AbortSignal) => apiFetch<QueueUpdatedPayload>('/venue/queue', { signal }),
  reorderQueue: (items: readonly string[]) =>
    apiFetch<QueueUpdatedPayload>('/venue/queue/reorder', { method: 'POST', body: { items } }),
  removeFromQueue: (queueItemId: string) =>
    apiFetch<QueueUpdatedPayload>(`/venue/queue/${encodeURIComponent(queueItemId)}`, {
      method: 'DELETE',
    }),

  settings: (signal?: AbortSignal) => apiFetch<VenueDetailDto>('/venue/settings', { signal }),
  updateSettings: (body: UpdateVenueSettingsInput) =>
    apiFetch<VenueDetailDto>('/venue/settings', { method: 'PATCH', body }),

  pricing: (signal?: AbortSignal) => apiFetch<VenuePricingDto>('/venue/pricing', { signal }),
  updatePricing: (body: UpdateVenuePricingInput) =>
    apiFetch<VenuePricingDto>('/venue/pricing', { method: 'PATCH', body }),

  filters: (signal?: AbortSignal) =>
    apiFetch<readonly BlockedRuleDto[]>('/venue/filters', { signal }),
  createFilter: (body: CreateBlockedRuleInput) =>
    apiFetch<BlockedRuleDto>('/venue/filters', { method: 'POST', body }),
  removeFilter: (ruleId: string) =>
    apiFetch<{ removed: true }>(`/venue/filters/${encodeURIComponent(ruleId)}`, {
      method: 'DELETE',
    }),

  qrCodes: (signal?: AbortSignal) => apiFetch<readonly QrCodeDto[]>('/venue/qr-codes', { signal }),
  createQrCode: (body: CreateQrCodeInput) =>
    apiFetch<QrCodeDto>('/venue/qr-codes', { method: 'POST', body }),
  deactivateQrCode: (qrCodeId: string) =>
    apiFetch<{ deactivated: true }>(`/venue/qr-codes/${encodeURIComponent(qrCodeId)}`, {
      method: 'DELETE',
    }),

  stats: (period: StatsPeriod, range: { from?: string; to?: string } = {}, signal?: AbortSignal) =>
    apiFetch<VenueStatsDto>('/venue/stats', {
      query: { period, from: range.from, to: range.to },
      signal,
    }),
};

/**
 * The player console.
 *
 * Playback progress is reported over HTTP because each report moves the queue forward inside a
 * database transaction; the browser reports what happened, the server decides what follows.
 */
export const playerApi = {
  state: (sessionId: string, signal?: AbortSignal) =>
    apiFetch<PlayerStateDto>('/venue/player/state', { query: { sessionId }, signal }),
  start: (sessionId: string, takeover: boolean) =>
    apiFetch<PlayerStateDto>('/venue/player/start', {
      method: 'POST',
      body: { sessionId, takeover },
    }),
  complete: (sessionId: string, queueItemId: string) =>
    apiFetch<PlayerStateDto>('/venue/player/complete', {
      method: 'POST',
      body: { sessionId, queueItemId },
    }),
  reportError: (sessionId: string, queueItemId: string, code: string, message: string) =>
    apiFetch<PlayerStateDto>('/venue/player/error', {
      method: 'POST',
      body: { sessionId, queueItemId, code, message },
    }),
  skip: (sessionId: string) =>
    apiFetch<PlayerStateDto>('/venue/player/next', { method: 'POST', body: { sessionId } }),
  pause: (sessionId: string) =>
    apiFetch<PlayerStateDto>('/venue/player/pause', { method: 'POST', body: { sessionId } }),
  resume: (sessionId: string) =>
    apiFetch<PlayerStateDto>('/venue/player/resume', { method: 'POST', body: { sessionId } }),
  heartbeat: (sessionId: string) =>
    apiFetch<PlayerLeaseDto>('/venue/player/heartbeat', { method: 'POST', body: { sessionId } }),
  release: (sessionId: string) =>
    apiFetch<{ released: true }>('/venue/player/release', { method: 'POST', body: { sessionId } }),
};

/**
 * The operator console.
 *
 * A separate cookie backs these calls, so signing in here says nothing about any venue session
 * and signing out of a venue says nothing about this one.
 */
export const systemAuthApi = {
  login: (body: SystemLoginInput) =>
    apiFetch<AuthenticatedSystemUserDto>('/auth/system/login', { method: 'POST', body }),
  logout: () => apiFetch<{ ok: true }>('/auth/system/logout', { method: 'POST' }),
  me: (signal?: AbortSignal) => apiFetch<AuthenticatedSystemUserDto>('/auth/system/me', { signal }),
};

export const systemApi = {
  settings: (signal?: AbortSignal) =>
    apiFetch<SystemSettingsResponse>('/system/settings', { signal }),
  updateSettings: (body: SystemSettingsUpdate) =>
    apiFetch<SystemSettingsResponse>('/system/settings', { method: 'PATCH', body }),

  venues: (search: string, signal?: AbortSignal) =>
    apiFetch<PaginatedResponse<SystemVenueDto>>('/system/venues', {
      query: search.length > 0 ? { search } : {},
      signal,
    }),

  createVenue: (body: CreateVenueInput) =>
    apiFetch<CreatedVenueDto>('/system/venues', { method: 'POST', body }),

  venue: (venueId: string, signal?: AbortSignal) =>
    apiFetch<SystemVenueDetailDto>(`/system/venues/${encodeURIComponent(venueId)}`, { signal }),

  updateVenue: (venueId: string, body: UpdateVenueSettingsInput) =>
    apiFetch<VenueDetailDto>(`/system/venues/${encodeURIComponent(venueId)}`, {
      method: 'PATCH',
      body,
    }),

  venueUsers: (venueId: string, signal?: AbortSignal) =>
    apiFetch<readonly VenueUserDto[]>(`/system/venues/${encodeURIComponent(venueId)}/users`, {
      signal,
    }),

  createVenueUser: (venueId: string, body: CreateVenueUserInput) =>
    apiFetch<CreatedVenueUserDto>(`/system/venues/${encodeURIComponent(venueId)}/users`, {
      method: 'POST',
      body,
    }),

  updateVenueUser: (venueId: string, userId: string, body: UpdateVenueUserInput) =>
    apiFetch<VenueUserDto>(
      `/system/venues/${encodeURIComponent(venueId)}/users/${encodeURIComponent(userId)}`,
      { method: 'PATCH', body },
    ),

  resetVenueUserPassword: (venueId: string, userId: string) =>
    apiFetch<PasswordResetDto>(
      `/system/venues/${encodeURIComponent(venueId)}/users/${encodeURIComponent(userId)}/password`,
      { method: 'POST' },
    ),

  operators: (signal?: AbortSignal) =>
    apiFetch<readonly SystemUserDto[]>('/system/users', { signal }),

  createOperator: (body: CreateSystemUserInput) =>
    apiFetch<CreatedSystemUserDto>('/system/users', { method: 'POST', body }),

  updateOperator: (userId: string, body: UpdateSystemUserInput) =>
    apiFetch<SystemUserDto>(`/system/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body,
    }),

  resetOperatorPassword: (userId: string) =>
    apiFetch<PasswordResetDto>(`/system/users/${encodeURIComponent(userId)}/password`, {
      method: 'POST',
    }),
};
