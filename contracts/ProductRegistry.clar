(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PRODUCT-ID u101)
(define-constant ERR-INVALID-METADATA-HASH u102)
(define-constant ERR-INVALID-DESCRIPTION u103)
(define-constant ERR-PRODUCT-ALREADY-EXISTS u104)
(define-constant ERR-PRODUCT-NOT-FOUND u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u107)
(define-constant ERR-INVALID-PRODUCER u108)
(define-constant ERR-INVALID-UPDATE-PARAM u109)
(define-constant ERR-MAX-PRODUCTS-EXCEEDED u110)
(define-constant ERR-INVALID-ORIGIN u111)
(define-constant ERR-INVALID-CATEGORY u112)
(define-constant ERR-INVALID-STATUS u113)
(define-data-var next-product-id uint u0)
(define-data-var max-products uint u10000)
(define-data-var authority-contract (optional principal) none)
(define-data-var registration-fee uint u500)
(define-map products
  uint
  {
    product-id: (string-utf8 50),
    producer: principal,
    metadata-hash: (string-utf8 64),
    description: (string-utf8 200),
    origin: (string-utf8 100),
    category: (string-utf8 50),
    timestamp: uint,
    status: bool
  }
)
(define-map products-by-id
  (string-utf8 50)
  uint
)
(define-map product-updates
  uint
  {
    update-metadata-hash: (string-utf8 64),
    update-description: (string-utf8 200),
    update-origin: (string-utf8 100),
    update-timestamp: uint,
    updater: principal
  }
)
(define-read-only (get-product (id uint))
  (map-get? products id)
)
(define-read-only (get-product-updates (id uint))
  (map-get? product-updates id)
)
(define-read-only (is-product-registered (product-id (string-utf8 50)))
  (is-some (map-get? products-by-id product-id))
)
(define-read-only (get-product-count)
  (ok (var-get next-product-id))
)
(define-read-only (check-product-existence (product-id (string-utf8 50)))
  (ok (is-product-registered product-id))
)
(define-private (validate-product-id (product-id (string-utf8 50)))
  (if (and (> (len product-id) u0) (<= (len product-id) u50))
      (ok true)
      (err ERR-INVALID-PRODUCT-ID))
)
(define-private (validate-metadata-hash (hash (string-utf8 64)))
  (if (and (> (len hash) u0) (<= (len hash) u64))
      (ok true)
      (err ERR-INVALID-METADATA-HASH))
)
(define-private (validate-description (desc (string-utf8 200)))
  (if (and (> (len desc) u0) (<= (len desc) u200))
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)
(define-private (validate-origin (origin (string-utf8 100)))
  (if (and (> (len origin) u0) (<= (len origin) u100))
      (ok true)
      (err ERR-INVALID-ORIGIN))
)
(define-private (validate-category (category (string-utf8 50)))
  (if (or (is-eq category u"food") (is-eq category u"pharma") (is-eq category u"luxury") (is-eq category u"electronics"))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)
(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)
(define-private (validate-producer (producer principal))
  (if (not (is-eq producer 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-PRODUCER))
)
(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-producer contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)
(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set registration-fee new-fee)
    (ok true)
  )
)
(define-public (register-product
  (product-id (string-utf8 50))
  (metadata-hash (string-utf8 64))
  (description (string-utf8 200))
  (origin (string-utf8 100))
  (category (string-utf8 50))
)
  (let (
      (next-id (var-get next-product-id))
      (current-max (var-get max-products))
      (authority (var-get authority-contract))
    )
    (asserts! (< next-id current-max) (err ERR-MAX-PRODUCTS-EXCEEDED))
    (try! (validate-product-id product-id))
    (try! (validate-metadata-hash metadata-hash))
    (try! (validate-description description))
    (try! (validate-origin origin))
    (try! (validate-category category))
    (try! (validate-producer tx-sender))
    (asserts! (is-none (map-get? products-by-id product-id)) (err ERR-PRODUCT-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get registration-fee) tx-sender authority-recipient))
    )
    (map-set products next-id
      {
        product-id: product-id,
        producer: tx-sender,
        metadata-hash: metadata-hash,
        description: description,
        origin: origin,
        category: category,
        timestamp: block-height,
        status: true
      }
    )
    (map-set products-by-id product-id next-id)
    (var-set next-product-id (+ next-id u1))
    (print { event: "product-registered", id: next-id })
    (ok next-id)
  )
)
(define-public (update-product
  (id uint)
  (new-metadata-hash (string-utf8 64))
  (new-description (string-utf8 200))
  (new-origin (string-utf8 100))
)
  (let ((product (map-get? products id)))
    (match product
      p
      (begin
        (asserts! (is-eq (get producer p) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-metadata-hash new-metadata-hash))
        (try! (validate-description new-description))
        (try! (validate-origin new-origin))
        (map-set products id
          {
            product-id: (get product-id p),
            producer: (get producer p),
            metadata-hash: new-metadata-hash,
            description: new-description,
            origin: new-origin,
            category: (get category p),
            timestamp: block-height,
            status: (get status p)
          }
        )
        (map-set product-updates id
          {
            update-metadata-hash: new-metadata-hash,
            update-description: new-description,
            update-origin: new-origin,
            update-timestamp: block-height,
            updater: tx-sender
          }
        )
        (print { event: "product-updated", id: id })
        (ok true)
      )
      (err ERR-PRODUCT-NOT-FOUND)
    )
  )
)
(define-public (verify-product (id uint))
  (let ((product (map-get? products id)))
    (match product
      p (ok (get status p))
      (err ERR-PRODUCT-NOT-FOUND)
    )
  )
)