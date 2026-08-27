# Moodisto

Mekân müziğini misafirin eline veren interaktif istek sistemi. Misafir masadaki QR kodu okutur,
mekânın sayfasına düşer, şarkı arar, istek tipini seçer ve gönderir. Mekân yönetimi isteği onaylar
ya da reddeder; onaylanan istek sıraya girer ve mekândaki **Player** sekmesi sırayı çalar. Şarkı
bitince bir sonraki otomatik başlar.

Her şey responsive web üzerinde çalışır: **PWA, Electron veya native uygulama yoktur.** Misafir,
mekân yönetimi ve player aynı Next.js uygulamasının farklı route group'larıdır.

Sıranın ve player durumunun tek doğruluk kaynağı (**source of truth**) PostgreSQL'dir. Tarayıcı
belleği veya bir sağlayıcı playlist'i asla sıranın sahibi değildir; tarayıcı yalnızca veritabanının
söylediğini gösterir.

---

## İçindekiler

- [Mimari](#mimari)
- [Depo yapısı](#depo-yapısı)
- [Gereksinimler](#gereksinimler)
- [Kurulum](#kurulum)
- [Ortam değişkenleri](#ortam-değişkenleri)
- [Sistem paneli ve ayarlar](#sistem-paneli-ve-ayarlar)
- [Migration ve seed](#migration-ve-seed)
- [Geliştirme](#geliştirme)
- [Testler](#testler)
- [Production build](#production-build)
- [Docker ile çalıştırma](#docker-ile-çalıştırma)
- [Domain akışı](#domain-akışı)
- [API yüzeyi](#api-yüzeyi)
- [Realtime olayları](#realtime-olayları)
- [Müzik sağlayıcı yapılandırması](#müzik-sağlayıcı-yapılandırması)
- [Ödeme yapılandırması](#ödeme-yapılandırması)
- [Güvenlik](#güvenlik)
- [Bilinen sağlayıcı kısıtları](#bilinen-sağlayıcı-kısıtları)

---

## Mimari

Katmanlar Clean Architecture'ın Dependency Rule'una uyar: kaynak kod bağımlılıkları yalnızca içeri
doğrudur.

```
                    ┌─────────────────────────────────────────────┐
                    │  Frameworks & Drivers                       │
                    │  Next.js UI · Prisma · Socket.IO · YouTube   │
                    │  · iyzico · Express                         │
                    └───────────────────┬─────────────────────────┘
                                        │ implements
                    ┌───────────────────▼─────────────────────────┐
                    │  Interface Adapters                          │
                    │  Nest controller · repository · gateway      │
                    │  · DTO mapper                                │
                    └───────────────────┬─────────────────────────┘
                                        │ depends on ports
                    ┌───────────────────▼─────────────────────────┐
                    │  Use Cases (apps/api/src/*/**.usecase.ts)    │
                    │  ports: repositories · services · database   │
                    └───────────────────┬─────────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────────┐
                    │  Domain (@moodisto/queue-engine)             │
                    │  sıra yerleşimi · state machine · filtre     │
                    │  · fiyat · duplicate politikası              │
                    └─────────────────────────────────────────────┘
```

- **Domain** (`packages/queue-engine`) hiçbir framework, I/O veya SDK import etmez. Nasıl
  saklandığını ve nasıl sunulduğunu bilmez.
- **Use case**'ler yalnızca port arayüzlerine bağlıdır (`apps/api/src/application/ports`). Prisma
  tipi, Express request'i veya Socket.IO nesnesi use case'e geçmez.
- **Detaylar eklentidir**: veritabanı, müzik sağlayıcı, ödeme sağlayıcı ve realtime taşıyıcı
  `apps/api/src/infrastructure` altındaki adapter'lardır ve DI ile enjekte edilir.
- **Unit of Work**: `Database.transaction(uow => …)` içinde tüm repository'ler tek bir
  transactional bağlantıyı paylaşır. Realtime mesajları `uow.publish(...)` ile tamponlanır ve
  **yalnızca transaction commit olduktan sonra** yayınlanır; rollback olan bir değişikliğin olayı
  istemciye asla ulaşmaz.
- **Row locking**: sırayı değiştiren her transaction ilk iş olarak `venues.lockForUpdate(venueId)`
  (`SELECT … FOR UPDATE`) çağırır; sıradaki bir sonraki parça `FOR UPDATE SKIP LOCKED` ile alınır.
  Race condition üretebilecek read-modify-write adımları transaction dışına çıkarılmaz.

### Provider-agnostik müzik katmanı

Domain'de `youtubeVideoId` gibi bir alan yoktur. Parça kimliği her yerde `provider` +
`providerTrackId` ikilisidir (`Track` modeli dahil). YouTube'a özgü her şey
`packages/music-provider/src/youtube` içinde kalır:

```
MusicProvider (port)
  ├── YoutubeMusicProvider      → YouTube Data API v3 (yalnızca sunucu tarafı)
  ├── FakeMusicProvider         → çevrimdışı geliştirme ve testler
  └── CachedMusicProvider       → decorator: 24 saatlik PostgreSQL arama cache'i
MusicProviderRegistry           → yapılandırmaya göre sağlayıcı seçer
ProviderPlayerRegistry (web)    → provider kimliğine göre player bileşenini seçer
```

Lisanslı bir sağlayıcıya geçmek tek modül değişikliğidir: yeni bir `MusicProvider` adapter'ı ve
karşılığında bir player bileşeni yazılır; use case'ler, veritabanı şeması ve UI değişmez.

---

## Depo yapısı

pnpm workspace monorepo:

| Paket                     | Açıklama                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| `apps/api`                | NestJS backend: istek yaşam döngüsü, sıra orkestrasyonu, realtime, ödemeler |
| `apps/web`                | Next.js 15 App Router istemci: misafir sayfası, mekân konsolu, player       |
| `apps/e2e`                | Playwright uçtan uca test paketi                                            |
| `packages/queue-engine`   | Framework'süz domain kuralları                                              |
| `packages/music-provider` | Müzik arama/çalma portu ve YouTube adapter'ı                                |
| `packages/database`       | Prisma şeması, client factory, migration'lar ve seed                        |
| `packages/shared-types`   | API ve istemcinin paylaştığı DTO'lar, enum'lar, realtime sözleşmesi         |
| `packages/validation`     | API ve istemcinin paylaştığı Zod şemaları                                   |
| `docker/`                 | API ve web imajları (`Dockerfile`) ve PostgreSQL init betikleri             |

`apps/web` tek bir Next.js uygulamasıdır ve route group'lara ayrılır:

```
src/app/(customer)/…      misafir: /, /join/[qrToken], /v/[slug], /v/[slug]/search,
                          /v/[slug]/request/[id], /v/[slug]/top, /checkout/mock
src/app/(venue)/venue/…   mekân: /venue/login ve (console) altında dashboard, requests,
                          queue, player, qr, filters, settings, stats
```

---

## Gereksinimler

- **Node.js ≥ 20.11** (geliştirme Node 24 ile yapılmıştır)
- **pnpm 10.15.0** (`corepack enable` yeterlidir)
- **Docker** (PostgreSQL 16 için) veya yerel bir PostgreSQL 16 kurulumu. Node ve pnpm kurmadan
  tüm yığını konteynerde çalıştırmak da mümkün: [Docker ile çalıştırma](#docker-ile-çalıştırma)

---

## Kurulum

```bash
corepack enable
pnpm install

cp .env.example .env          # ardından secret'ları kendi değerlerinizle değiştirin
docker compose up -d postgres # PostgreSQL 16, varsayılan port 5433

pnpm db:generate              # Prisma client
pnpm db:migrate:deploy        # şemayı kur
pnpm db:seed                  # örnek mekânlar, fiyatlar, QR kodlar ve hesaplar
pnpm dev                      # API :3001, web :3000
```

`docker compose` ayağa kalkarken `docker/postgres/init/10-create-test-database.sql` betiği
`moodisto_test` ve `moodisto_e2e` veritabanlarını da oluşturur; entegrasyon ve E2E paketleri
geliştirme verisine hiç dokunmaz.

### Seed ile gelen veri

- Mekânlar: **Cafe Moda** (`cafe-moda`) ve **Bar Bebek** (`bar-bebek`)
- Cafe Moda fiyatlandırması: normal **0**, öncelikli **2000**, DJ **3000**, sıradaki çalsın **5000**
  (hepsi kuruş cinsinden tam sayı)
- Masa QR kodları: Masa 1, Masa 2, Bar, Bahçe, VIP
- Hesaplar: `SEED_OWNER_EMAIL` (OWNER) ve aynı parolayla bir DJ kullanıcısı. Parola
  `SEED_OWNER_PASSWORD` ile gelir ve argon2id ile hash'lenir.
- Sistem hesabı: `SEED_SYSTEM_EMAIL` / `SEED_SYSTEM_PASSWORD`. Hiçbir mekâna bağlı değildir ve
  yalnızca `/system/login` üzerinden girer.

---

## Ortam değişkenleri

Tam liste ve açıklamaları `.env.example` dosyasındadır. Öne çıkanlar:

| Değişken                                                                          | Anlamı                                  |
| --------------------------------------------------------------------------------- | --------------------------------------- |
| `DATABASE_URL`                                                                    | Geliştirme veritabanı                   |
| `TEST_DATABASE_URL` / `E2E_DATABASE_URL`                                          | Entegrasyon ve Playwright veritabanları |
| `APP_URL`, `API_URL`, `CORS_ORIGINS`                                              | Origin whitelist ve mutlak URL üretimi  |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`                                      | Tarayıcıya derlenen tek genel değerler  |
| `COOKIE_SECRET`, `JWT_SECRET`                                                     | En az 32 karakter; asla depoya girmez   |
| `SETTINGS_ENCRYPTION_KEY`                                                         | Veritabanındaki gizli ayarları şifreler |
| `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS`                               | Token ömürleri                          |
| `MUSIC_PROVIDER`, `YOUTUBE_API_KEY`, `MUSIC_PROVIDER_FAKE`                        | Müzik sağlayıcı seçimi                  |
| `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_SECRET`, `PAYMENT_WEBHOOK_SECRET` | Ödeme sağlayıcı                         |
| `ENABLE_PAID_REQUESTS`, `ENABLE_YOUTUBE_PLAYBACK`, `RATE_LIMIT_ENABLED`           | Özellik bayrakları                      |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`                                         | Yalnızca seed içindir                   |
| `SEED_SYSTEM_EMAIL`, `SEED_SYSTEM_PASSWORD`                                       | Sistem paneli hesabı; yalnızca seed     |

`YOUTUBE_API_KEY` yalnızca API sürecinde okunur. `NEXT_PUBLIC_` öneki taşımadığı için tarayıcı
bundle'ına hiçbir koşulda girmez.

Müzik, ödeme ve özellik bayrağı değişkenleri artık son söz sahibi değildir: aynı ayarların
veritabanı karşılığı varsa o kazanır. Ayrıntı için [Sistem paneli ve
ayarlar](#sistem-paneli-ve-ayarlar).

---

## Sistem paneli ve ayarlar

Entegrasyon anahtarlarını değiştirmek için dosya düzenleyip yeniden dağıtım yapmak gerekmez.
Kurulumun işletmecisi `/system/login` üzerinden kendi hesabıyla girer ve `/system/settings`
ekranından şunları yönetir:

| Grup                | Ayarlar                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Müzik sağlayıcısı   | `MUSIC_PROVIDER_FAKE`, `YOUTUBE_API_KEY`, `YOUTUBE_REGION_CODE`, `YOUTUBE_RELEVANCE_LANGUAGE`         |
| Ödeme sağlayıcısı   | `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_SECRET`, `PAYMENT_BASE_URL`, `PAYMENT_WEBHOOK_SECRET` |
| Özellik anahtarları | `ENABLE_PAID_REQUESTS`, `ENABLE_YOUTUBE_PLAYBACK`, `RATE_LIMIT_ENABLED`                               |

Altyapı değişkenleri (`DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `API_PORT`, `APP_URL`,
`CORS_ORIGINS`, `NODE_ENV`, `SETTINGS_ENCRYPTION_KEY`) panelde yer almaz: süreç bunlar olmadan
zaten açılmaz, dolayısıyla kararlarını bir panel veremez.

**Öncelik sırası** her ayar için aynıdır ve panelde her satırın yanında rozetle gösterilir:

```
veritabanı kaydı  →  .env değeri  →  şema varsayılanı
```

Hiç kayıt yoksa kurulum bugünkü davranışını sürdürür. Bir satır kaydedildiğinde etkisi **anında**
başlar; API'yi yeniden başlatmak gerekmez. Müzik ve ödeme adaptörleri ayar imzası değiştiğinde
kendilerini yeniden kurar, webhook imza anahtarı ise bildirim geldiği anda okunur — böylece para
havadayken bile anahtar döndürülebilir. Bir kaydı silmek satırın yanındaki **Temizle** düğmesiyle
olur; değer o anda bir alt kaynağa (`.env` veya varsayılan) düşer.

**Gizli değerler asla düz metin dönmez.** `YOUTUBE_API_KEY`, `PAYMENT_API_KEY`, `PAYMENT_SECRET` ve
`PAYMENT_WEBHOOK_SECRET` veritabanında AES-256-GCM ile şifrelenir; API yanıtı yalnızca "tanımlı mı"
bilgisini ve son dört karakterlik maskeli bir önizlemeyi (`••••dK3f`) içerir. Panelde boş bırakılan
bir gizli alan "değişmedi" demektir, temizlemek ayrı bir eylemdir.

Şifreleme anahtarı `SETTINGS_ENCRYPTION_KEY` değişkeninden gelir (en az 32 karakter). Production'da
zorunludur; geliştirme ve testte tanımlı değilse `JWT_SECRET`'tan türetilir ve açılışta uyarı
basılır. Anahtarı döndürmek daha önce yazılmış gizli değerleri okunamaz kılar — bu durumda ilgili
satır yedek kaynağa düşer, loglanır ve panelden yeniden girilmesi gerekir.

Üretimde reddedilen birleşimler: `PAYMENT_PROVIDER=mock` iken ücretli isteklerin açık olması, ve
demo müzik kataloğu kapalıyken `YOUTUBE_API_KEY`'in boş bırakılması. Geliştirmede aynı durumlar
yalnızca uyarı olarak loglanır.

### Mekân ve kullanıcı yönetimi

Sistem paneli aynı zamanda kurulumun mekânlarını ve hesaplarını yönetir: `/system/venues` mekânları,
`/system/users` sistem operatörlerini açar.

**Yeni mekân açmak tek bir işlemdir.** `/system/venues` altındaki form mekân adı, adres kısaltması
(ad yazıldıkça önerilir, elle değiştirilebilir), saat dilimi, ilk mekân sahibinin adı ve e-postası
ile isteğe bağlı bir masa etiketi ister. Kaydetmek tek bir transaction içinde şunları oluşturur:

1. mekân kaydı,
2. mekânın çalışabilmesi için zorunlu olan fiyatlandırma satırı (normal 0, öncelikli 2000, DJ 3000,
   sıradaki 5000 kuruş; `TRY`),
3. `IDLE` durumunda player state,
4. `OWNER` rolünde ilk hesap,
5. ilk QR kodu ve onun `/join/<token>` bağlantısı.

Herhangi bir adım başarısız olursa hiçbiri kalmaz: yarım kurulmuş bir mekân ortaya çıkamaz. Aynı
adres kısaltması veya aynı e-posta ikinci kez kullanılırsa istek `409` ile reddedilir.

**İlk parolayı sistem üretir.** Panelde parola alanı yoktur; hesap oluşturulduğunda veya
**Parolayı sıfırla** düğmesine basıldığında üretilen parola yanıtta bir kez düz metin olarak döner
ve ekranda kopyalanabilir biçimde gösterilir. Veritabanında yalnızca argon2id özeti durur, bu yüzden
parola bir daha okunamaz; kaybedilirse tek yol yeniden sıfırlamaktır.

**Silme yoktur, pasifleştirme vardır.** Mekânlar ve hesaplar `active = false` yapılır; istek
geçmişi, istatistikler ve ödeme kayıtları yerinde kalır. Pasifleştirmenin karşılıkları:

| Pasifleştirilen | Sonuç                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| Mekân           | Misafir sayfaları kapanır ve o mekânın kullanıcıları konsola giriş yapamaz |
| Mekân kullanıcı | Hesap giriş yapamaz, mekânın diğer hesapları etkilenmez                    |
| Operatör        | Sistem paneline giriş yapamaz                                              |

Kurulumu kilitlemeyi önleyen üç kural `422` ile reddedilir: bir mekânın **son aktif `OWNER`**
hesabı pasifleştirilemez veya rolü düşürülemez, bir operatör **kendini** pasifleştiremez ve
kurulumun **son aktif operatörü** pasifleştirilemez.

Adres kısaltması oluşturulduktan sonra değiştirilemez: basılmış QR kodları ve paylaşılmış
`/v/<kısaltma>` bağlantıları o adrese bağlıdır.

---

## Migration ve seed

```bash
pnpm db:migrate           # geliştirmede yeni migration üretir
pnpm db:migrate:deploy    # var olan migration'ları uygular (CI ve production)
pnpm db:seed              # seed'i çalıştırır (idempotent, upsert tabanlıdır)
pnpm db:studio            # Prisma Studio
```

Şema 16 tablo içerir: `venues`, `venue_users`, `venue_request_pricing`, `venue_qr_codes`,
`customer_sessions`, `tracks`, `music_search_cache`, `provider_quota_usage`, `song_requests`,
`queue_items`, `player_states`, `player_leases`, `payments`, `blocked_music_rules`,
`system_users`, `system_settings`.

`queue_items` üzerinde `(venueId, position)` için kısmi unique index vardır: aktif sırada iki
parçanın aynı pozisyona düşmesi veritabanı düzeyinde imkânsızdır.

---

## Geliştirme

```bash
pnpm dev        # API ve web birlikte
pnpm dev:api    # yalnızca API   → http://localhost:3001
pnpm dev:web    # yalnızca web   → http://localhost:3000
```

Elde bir YouTube API anahtarı yoksa `.env` içinde `MUSIC_PROVIDER_FAKE=true` yapın: arama, kotasız
ve deterministik bir çevrimdışı katalogdan cevaplanır.

Player'ı denemek için: mekân hesabıyla `/venue/login` → sağ alttaki **Player** kulakçığını aç →
**PLAYER'I BAŞLAT**. (`/venue/player` sayfası da aynı kulakçığı açar.)

Player konsolun sağ alt köşesinde, sekmelerden bağımsız bir kulakçıkta çalışır: konsol
sayfaları arasında gezmek müziği kesmez, çünkü oynatıcı sayfada değil konsol layout'unda durur.
Kulakçık kapalıyken de gömülü oynatıcı görünür kalır, yalnızca küçülür. Sayfayı yenilemek veya
konsoldan çıkmak player'ı durdurur; tarayıcı sesi yeniden başlatmak için bir dokunuş ister.

Player kirasını (lease) alan tek sekme çalar; ikinci bir sekme açıldığında ilkinin kirası düşer ve
o sekme `lease-revoked` komutunu alır.

---

## Testler

| Komut                   | Kapsam                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `pnpm test:unit`        | Domain kuralları, adapter'lar, guard'lar, servisler (Vitest) |
| `pnpm test:integration` | Gerçek PostgreSQL üzerinde HTTP + transaction davranışı      |
| `pnpm test:e2e`         | Playwright: misafir, konsol ve player birlikte               |

Entegrasyon paketi `TEST_DATABASE_URL`'i kullanır, migration'ları uygular ve her dosya arasında
tabloları truncate eder. Eşzamanlılık testleri 20 isteği aynı anda kabul edip pozisyonların
benzersiz ve boşluksuz kaldığını doğrular.

E2E paketi kendi veritabanını (`E2E_DATABASE_URL`) sıfırlar ve kendi sunucularını 3010/3011
portlarında ayağa kaldırır; geliştirme portlarına ve verisine dokunmaz. İlk çalıştırmadan önce:

```bash
pnpm --filter @moodisto/e2e e2e:install   # Chromium
pnpm test:e2e
```

E2E sırasında `NEXT_PUBLIC_PLAYER_STUB=1` ile sağlayıcı embed'i yerine "parça bitti" / "çalma
hatası" düğmeleri olan bir stand-in kullanılır. Bu bayrak geliştirmede ve production'da asla
verilmez.

---

## Production build

```bash
pnpm verify   # format:check + lint + typecheck + test:unit + build
pnpm build    # paketler → API (dist/main.js) → web (.next)
```

Çalıştırma:

```bash
pnpm db:migrate:deploy
node apps/api/dist/main.js          # API
pnpm --filter @moodisto/web start   # web
```

Production'da `NODE_ENV=production` olmalıdır: Content-Security-Policy `unsafe-eval` olmadan
uygulanır (bu izin yalnızca `next dev`'in fast refresh bundler'ı için verilir) ve çerezler `Secure`
bayrağıyla yazılır.

---

## Docker ile çalıştırma

`docker-compose.yml` iki farklı kullanımı destekler ve ikisi birbirine karışmaz.

**Geliştirme (varsayılan):** yalnızca PostgreSQL konteynerde, uygulama host'ta.

```bash
docker compose up -d      # sadece postgres
pnpm dev
```

Unit, entegrasyon ve Playwright paketlerinin beklediği kurulum budur; profil verilmediği sürece
uygulama servisleri hiç oluşturulmaz.

**Tüm yığın konteynerde:** migration, API ve web birlikte.

```bash
cp .env.example .env                            # secret'lar buradan okunur
                                                # SETTINGS_ENCRYPTION_KEY dahil: gizli ayarlar
                                                # onunla şifrelenir, değişirse okunamaz olur
docker compose --profile app up -d --build      # postgres → migrate → api → web
docker compose --profile seed run --rm seed     # örnek veri (isteğe bağlı, bir kez)
```

Web `http://localhost:3000`, API `http://localhost:3001` adresinde açılır. Sıralama zorunlu:
`migrate` başarıyla bitmeden API açılmaz, API sağlıklı olmadan web başlamaz — eski şemaya bağlı bir
API sessizce yanlış çalışmaktansa hiç kalkmaz.

```bash
docker compose --profile app logs -f api web
docker compose --profile app down               # konteynerler gider, veri volume'da kalır
docker compose --profile app down -v            # veriyi de sil
```

Bilinmesi gerekenler:

- **Web imajı ortama özeldir.** Next.js `NEXT_PUBLIC_API_URL` ve `NEXT_PUBLIC_APP_URL` değerlerini
  build sırasında bundle'a gömer, bu yüzden başka bir alan adı için imajın yeniden build edilmesi
  gerekir. Bu adresler tarayıcının gördüğü adreslerdir; konteyner ağındaki servis adları değil.
  API imajı ortamdan bağımsızdır, bütün ayarlarını çalışma anında okur.
- **Secret'lar imaja girmez.** `.env` konteynere çalışma anında bağlanır, `.dockerignore` onu build
  context'inin dışında tutar. Dosya yoksa servis yine kalkar ve API kendi config doğrulamasında
  eksik değişkeni söyler.
- **`NODE_ENV` varsayılan olarak `development`.** `production` çerezleri `Secure` bayrağıyla yazar
  ve `Secure` bir çerez düz http üzerinde taşınmaz; önüne TLS koyduktan sonra `.env` içinden
  `NODE_ENV=production` verin.
- **Port çakışması.** Host'ta `pnpm dev` çalışırken yığını yan yana denemek için
  `WEB_PORT=3100 API_PORT=3101 NEXT_PUBLIC_API_URL=http://localhost:3101 docker compose --profile app up -d --build`
  yeterlidir.
- **Migration ve seed aynı API imajından çalışır.** Bu yüzden imaj Prisma CLI'ını ve `tsx`'i de
  taşır; `pnpm db:*` script'lerinin beklediği `dotenv -e ../../.env` sarmalayıcısı konteynerde
  devrede olmadığı için komutlar `prisma migrate deploy` ve `tsx prisma/seed.ts` olarak doğrudan
  çağrılır.

---

## Domain akışı

### İstek durum makinesi

```
PENDING_PAYMENT ─(ödeme onaylandı)──► PENDING
                ├(ödeme başarısız)──► FAILED
                ├(süre doldu)───────► EXPIRED
                └(misafir iptal)────► CANCELLED

PENDING ─(mekân onayladı)─► ACCEPTED ─► QUEUED ─► PLAYING ─► COMPLETED
        ├(mekân reddetti)─► REJECTED             └────────► FAILED
        ├(misafir iptal)──► CANCELLED
        └(süre doldu)─────► EXPIRED

ACCEPTED / QUEUED ─(sıradan çıkarıldı veya iptal)────────► CANCELLED
QUEUED ─(çalınamadı)─────────────────────────────────────► FAILED
```

Geçersiz geçişler `@moodisto/queue-engine` içindeki `assertRequestTransition` tarafından
reddedilir; hiçbir adapter bu kuralı atlayamaz.

### Sıra yerleşimi

İstek tipi sıradaki yeri belirler: **Sıradaki çalsın** çalan parçanın hemen ardına, **DJ** ve
**Öncelikli** kendi tiyerlerinin sonuna, **Normal** listenin sonuna girer. Yerleştirme sırasında
arkadaki pozisyonlar kaydırılır; çıkarma ve tamamlama sonrası sıra sıkıştırılarak boşluk bırakılmaz.

### Filtreler ve duplicate politikası

Mekân; sanatçı, kanal ve anahtar kelime bazlı engel kuralları tanımlayabilir. Kural eşleşmesi
Türkçe'ye duyarlı normalizasyondan geçer. Aynı parça mekânda aktifken (beklemede, onaylı, sırada
veya çalıyor) tekrar istenemez; yakın zamanda çalınmışsa mekânın `duplicateCooldownMinutes` süresi
dolana dek reddedilir.

---

## API yüzeyi

Tüm uçlar `API_URL` altında sunulur. Misafir uçları imzalı bir oturum çerezi, mekân uçları JWT
çerezi ister.

**Misafir**

```
POST   /join/:qrToken                 QR ile mekâna katıl (masa etiketi koddan gelir)
GET    /venues/nearby                 konuma göre mekân listesi
GET    /venues/:slug                  mekân profili ve fiyatlandırma
GET    /venues/:slug/now-playing      o an çalan
GET    /venues/:slug/queue            genel sıra görünümü
GET    /venues/:slug/top              en çok istenen parçalar
GET    /music/search                  yerel katalog araması (ücretsiz, her tuş vuruşunda)
GET    /music/provider-search         sağlayıcı araması (kota harcar, yalnızca açık istekle)
POST   /venues/:slug/requests         istek oluştur
GET    /requests/:requestId           tek isteğin durumu
POST   /requests/:requestId/cancel    isteği iptal et
GET    /venues/:slug/my-requests      bu oturumun istekleri
```

**Mekân konsolu** (`/venue/*`, JWT gerektirir)

```
POST   /auth/venue/login · POST /auth/venue/logout · GET /auth/venue/me
GET    /venue/requests · POST /venue/requests/:id/accept · POST /venue/requests/:id/reject
GET    /venue/queue · POST /venue/queue/reorder · DELETE /venue/queue/:queueItemId
GET    /venue/settings · PATCH /venue/settings
GET    /venue/pricing  · PATCH /venue/pricing
GET    /venue/filters  · POST /venue/filters · DELETE /venue/filters/:ruleId
GET    /venue/qr-codes · POST /venue/qr-codes · DELETE /venue/qr-codes/:qrCodeId
GET    /venue/stats
```

**Player** (`/venue/player/*`, JWT + kira gerektirir)

```
GET    /venue/player/state
POST   /venue/player/start · complete · error · next · pause · resume · heartbeat · release
```

**Sistem paneli** (`/system/*`, operatör JWT'si gerektirir)

```
POST   /auth/system/login · POST /auth/system/logout · GET /auth/system/me
GET    /system/settings · PATCH /system/settings
GET    /system/venues · POST /system/venues
GET    /system/venues/:venueId · PATCH /system/venues/:venueId
GET    /system/venues/:venueId/users · POST /system/venues/:venueId/users
PATCH  /system/venues/:venueId/users/:userId
POST   /system/venues/:venueId/users/:userId/password
GET    /system/users · POST /system/users
PATCH  /system/users/:userId · POST /system/users/:userId/password
```

**Ödemeler**

```
POST   /payments/webhook       sağlayıcı webhook'u (imza doğrulanır)
POST   /payments/mock/settle   yalnızca mock sağlayıcı; imzalı gövde ister
```

---

## Realtime olayları

Socket.IO odaları: `venue:{id}:customers`, `venue:{id}:admin`, `venue:{id}:player`,
`request:{requestId}`. Bir istemci yalnızca yetkili olduğu odaya abone olabilir; misafir kendi
isteğini mekân genelinde değil, kendi `request:{id}` odasından takip eder.

| Olay                  | Yön                                                               |
| --------------------- | ----------------------------------------------------------------- |
| `request.created`     | mekân konsoluna yeni istek                                        |
| `request.updated`     | isteğin durumu değişti (onay, ret, sıra, çalıyor, çalındı, iptal) |
| `queue.updated`       | sıra değişti                                                      |
| `player.updated`      | player durumu değişti                                             |
| `player.nowPlaying`   | çalan parça değişti                                               |
| `player.command`      | player'a komut (play, pause, resume, skip, reload, lease-revoked) |
| `venue.stats.updated` | en çok istenenler değişti                                         |

---

## Müzik sağlayıcı yapılandırması

```bash
MUSIC_PROVIDER="YOUTUBE"
YOUTUBE_API_KEY="…"          # yalnızca sunucuda okunur
YOUTUBE_REGION_CODE="TR"
YOUTUBE_RELEVANCE_LANGUAGE="tr"
MUSIC_PROVIDER_FAKE=false
```

Arama kotası bilinçli olarak korunur. Sağlayıcının günlük hakkı satın alınabilir bir şey
olmadığı için akış **yerel katalog önce** kurulmuştur:

- **yazmak ücretsizdir**: her tuş vuruşu yalnızca `tracks` tablosunu arar (`/music/search`).
  Sağlayıcıdan dönen her sonuç bu tabloya yazıldığı için katalog her aramayla büyür ve bir kez
  sorulan parça ikinci kez sorulmaz,
- **sağlayıcı yalnızca açık dokunuşla** sorulur (`/music/provider-search`); konuk aradığını
  katalogda bulamadığına kendisi karar verir,
- en az **3 karakter** sorgu — her iki uç için de,
- istemcide **700 ms** debounce ve en fazla **10 sonuç**,
- sonuçlar `music_search_cache` tablosunda **24 saat** saklanır; önbellekten yanıtlanan arama hiç
  kota harcamaz.

Harcama `provider_quota_usage` tablosunda tutulur; PostgreSQL burada da tek doğruluk kaynağıdır.
API yeniden başladığında günün harcaması unutulmaz, iki API örneği de aynı kotayı ayrı ayrı
sahiplenmez. Kontrol ve harcama tek SQL ifadesindedir: aynı anda gelen iki arama son birimi iki kez
harcayamaz.

Günlük hakkın **500 birimi** aramadan esirgenir. Bu rezerv, şarkısını çoktan seçmiş bir konuğun
isteğini gönderebilmesi içindir (ilk kez istenen bir parçanın sağlayıcıdan sorulması); akşamın
aramaları hakkı bitirse bile istek gönderilmeye devam eder. Arama kapısı kapandığında yerel katalog
yanıt vermeyi sürdürür ve arama ekranı kapının ne zaman yeniden açılacağını söyler.

Katalog kendi kendini de temizler: hoparlörlere ulaşıp çalan parça "kanıtlanmış" olarak işaretlenir,
sağlayıcının kendi reddettiği parça (`EMBED_NOT_ALLOWED`, `VIDEO_UNAVAILABLE`) katalogdan düşer.
Mekâna özgü bir arıza (kopan bağlantı gibi) kataloğu asla küçültmez — bir kafenin internetinin
bozuk olması diğerlerinin kataloğunu daraltmamalıdır.

Arama daima backend üzerinden yapılır; tarayıcı sağlayıcıyla doğrudan konuşmaz.

---

## Ödeme yapılandırması

`PaymentProvider` portu sağlayıcıdan bağımsızdır; iki adapter gelir:

- **`mock`** — geliştirme ve testler için. `/checkout/mock` sayfası ödemeyi onaylatır, backend
  imzalı bir webhook gövdesiyle sonucu işler.
- **`iyzico`** — `PAYMENT_API_KEY`, `PAYMENT_SECRET`, `PAYMENT_BASE_URL` ve `PAYMENT_WEBHOOK_SECRET`
  ister.

Tutarlar **kuruş cinsinden tam sayıdır** (2000, 3000, 5000). Para hiçbir yerde float olarak
saklanmaz veya taşınmaz.

Ödemenin sonucu **frontend'e güvenilerek** belirlenmez: istek yalnızca sağlayıcı webhook'u imza
doğrulamasından geçtikten sonra `PENDING_PAYMENT` durumundan çıkar. Ödemesi 30 dakika içinde tamamlanmayan
istekler, aynı mekâna gelen bir sonraki istek transaction'ında `EXPIRED` durumuna alınır; ayrı bir
zamanlayıcıya ihtiyaç yoktur.

---

## Güvenlik

- **JWT localStorage'da tutulmaz.** Access ve refresh token'ları `HttpOnly`, `Secure` (production),
  `SameSite=Lax` çerezlerdedir. Misafir oturumu da aynı şekilde imzalı bir çerezdir.
- **Parolalar argon2id** ile hash'lenir.
- **CSRF**: durum değiştiren tüm isteklerde double-submit token doğrulaması (`CsrfGuard`).
- **CORS**: `CORS_ORIGINS` whitelist'i; credential'lı istekler yalnızca listedeki origin'lerden.
- **Rate limiting**: istek oluşturma 5/10 dk (oturum) ve 20/saat (IP), arama 30/dk (IP), QR
  katılımı 20/5 dk (IP), giriş 10/5 dk (IP), webhook 120/dk (IP).
- **Girdi doğrulama**: her uçta paylaşılan Zod şemaları (`@moodisto/validation`) ve
  `ZodValidationPipe`.
- **SQL injection**: tüm erişim Prisma üzerinden parametreli sorgularla yapılır.
- **XSS**: React kaçışı; `dangerouslySetInnerHTML` kullanılmaz. Content-Security-Policy,
  `X-Content-Type-Options`, `Referrer-Policy` ve `Permissions-Policy` başlıklarını sayfaları sunan
  Next.js verir; yalnızca JSON döndüren API'de helmet `nosniff`, `Referrer-Policy` ve
  `Cross-Origin-Resource-Policy` uygular.
- **API anahtarı** yalnızca sunucudadır; tarayıcı bundle'ında yer almaz. Sistem panelinden
  girilse bile şifrelenmiş olarak saklanır ve hiçbir yanıtta düz metin dönmez.
- **Sistem oturumu ayrıdır**: `/system/*` uçları kendi çerezi ve kendi JWT scope'uyla korunur;
  mekân oturumu bu konsolu açamaz, sistem oturumu mekân uçlarına geçemez.
- **QR brute force**: token uçları rate limit'lidir ve kod pasifleştirilebilir/süreli olabilir.
- **Secret'lar depoya girmez**; `.env` git dışıdır, `.env.example` yalnızca yer tutucu içerir.

---

## Bilinen sağlayıcı kısıtları

YouTube'un standart şartları, içeriğin kişisel olmayan/ticari kullanımını kısıtlar; videoların
umuma açık gösterimini ve müzik yayınını yasaklar. Bu nedenle:

- Bu depodaki **YouTube sağlayıcısı geliştirme ve demo içindir.** Production'da lisanslı bir
  sağlayıcıya geçmek mimari gereği tek modül değişikliğidir.
- Player embed'i **görünürdür**; gizli iframe, `display:none` veya yalnızca arka planda çalma
  yoktur. Reklamlar ve oynatıcı davranışı engellenmez. Konsoldaki kulakçık kapatıldığında da embed
  ekranda kalır, yalnızca küçülür.
- `yt-dlp`, YouTube URL → MP3 dönüşümü ve ses akışı çıkarma **kesinlikle yoktur** ve eklenmemelidir.

Mekân müziğini umuma açık çalmak, bulunduğunuz ülkedeki meslek birliklerine karşı ayrıca telif
yükümlülüğü doğurur; bu yükümlülük mekâna aittir.
