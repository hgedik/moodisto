import {
  PaymentStatus,
  PlaybackState,
  QueueItemState,
  RequestStatus,
  RequestType,
  VenueUserRole,
  type BlockedRuleType,
} from '@moodisto/shared-types';

const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

/** Amounts travel as integers in the currency's minor unit; only the view divides by 100. */
export const formatMoney = (amountMinor: number, currency: string): string => {
  if (amountMinor === 0) {
    return 'Ücretsiz';
  }
  const formatter =
    currency === 'TRY' ? money : new Intl.NumberFormat('tr-TR', { style: 'currency', currency });
  return formatter.format(amountMinor / 100);
};

export const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds <= 0) {
    return '--:--';
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

export const formatClock = (iso: string | null): string => {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

export const formatDateTime = (iso: string | null): string => {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatRelative = (iso: string): string => {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) {
    return 'az önce';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} dk önce`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)} sa önce`;
  }
  return formatDateTime(iso);
};

export const formatDistance = (meters: number): string =>
  meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;

export const requestTypeLabel: Record<RequestType, string> = {
  [RequestType.NORMAL]: 'Normal istek',
  [RequestType.PRIORITY]: 'Öncelikli',
  [RequestType.DJ]: 'DJ isteği',
  [RequestType.PLAY_NEXT]: 'Sıradaki çalsın',
};

export const requestTypeHint: Record<RequestType, string> = {
  [RequestType.NORMAL]: 'Sıranın sonuna eklenir.',
  [RequestType.PRIORITY]: 'Normal isteklerin önüne geçer.',
  [RequestType.DJ]: 'DJ’e özel not olarak iletilir, önceliklidir.',
  [RequestType.PLAY_NEXT]: 'Çalan parçadan hemen sonra çalar.',
};

export const requestStatusLabel: Record<RequestStatus, string> = {
  [RequestStatus.PENDING_PAYMENT]: 'Ödeme bekleniyor',
  [RequestStatus.PENDING]: 'Onay bekliyor',
  [RequestStatus.ACCEPTED]: 'Onaylandı',
  [RequestStatus.REJECTED]: 'Reddedildi',
  [RequestStatus.QUEUED]: 'Sırada',
  [RequestStatus.PLAYING]: 'Çalıyor',
  [RequestStatus.COMPLETED]: 'Çalındı',
  [RequestStatus.CANCELLED]: 'İptal edildi',
  [RequestStatus.EXPIRED]: 'Süresi doldu',
  [RequestStatus.FAILED]: 'Başarısız',
};

export type StatusTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'brand';

export const requestStatusTone: Record<RequestStatus, StatusTone> = {
  [RequestStatus.PENDING_PAYMENT]: 'warning',
  [RequestStatus.PENDING]: 'warning',
  [RequestStatus.ACCEPTED]: 'positive',
  [RequestStatus.REJECTED]: 'danger',
  [RequestStatus.QUEUED]: 'brand',
  [RequestStatus.PLAYING]: 'brand',
  [RequestStatus.COMPLETED]: 'positive',
  [RequestStatus.CANCELLED]: 'neutral',
  [RequestStatus.EXPIRED]: 'neutral',
  [RequestStatus.FAILED]: 'danger',
};

export const playbackStateLabel: Record<PlaybackState, string> = {
  [PlaybackState.IDLE]: 'Boşta',
  [PlaybackState.LOADING]: 'Yükleniyor',
  [PlaybackState.PLAYING]: 'Çalıyor',
  [PlaybackState.PAUSED]: 'Duraklatıldı',
  [PlaybackState.ERROR]: 'Hata',
};

export const queueStateLabel: Record<QueueItemState, string> = {
  [QueueItemState.QUEUED]: 'Sırada',
  [QueueItemState.PLAYING]: 'Çalıyor',
  [QueueItemState.COMPLETED]: 'Çalındı',
  [QueueItemState.REMOVED]: 'Çıkarıldı',
  [QueueItemState.FAILED]: 'Başarısız',
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Ödeme bekleniyor',
  [PaymentStatus.PAID]: 'Ödendi',
  [PaymentStatus.FAILED]: 'Ödeme başarısız',
  [PaymentStatus.REFUNDED]: 'İade edildi',
};

export const blockedRuleTypeLabel: Record<BlockedRuleType, string> = {
  TRACK: 'Parça',
  CHANNEL: 'Kanal',
  KEYWORD: 'Anahtar kelime',
};

export const venueUserRoleLabel: Record<VenueUserRole, string> = {
  [VenueUserRole.OWNER]: 'Sahip',
  [VenueUserRole.MANAGER]: 'Yönetici',
  [VenueUserRole.DJ]: 'DJ',
};

export const canEditVenue = (role: VenueUserRole): boolean =>
  role === VenueUserRole.OWNER || role === VenueUserRole.MANAGER;
