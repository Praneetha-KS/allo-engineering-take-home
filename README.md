# Allo Engineering Take-Home – Inventory Reservation System

This is a complete, production-ready implementation of the multi-warehouse inventory reservation system built with Next.js (App Router), TypeScript, Prisma, and a hosted PostgreSQL database (Neon). 

The application handles high-concurrency checkout volumes by isolating temporary holds from main stock and enforcing database-level locking during the reservation window.

## 🚀 Tech Stack
- **Framework:** Next.js 15+ (App Router)
- **Language:** TypeScript
- **ORM:** Prisma
- **Database:** Hosted PostgreSQL (Neon)
- **Styling:** Tailwind CSS

---

## 🛠️ Local Setup Instructions

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
2. **Configure your Environment Variables:**
Create a .env file in the root directory and paste your hosted database connection string:

Code snippet
DATABASE_URL="postgresql://neondb_owner:npg_g1GSwjIem9bk@ep-fragrant-snow-apezfkh2.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require"

3. **Push the database schema:**

npx prisma db push

4. **Seed the database with sample inventory:**

npx prisma db seed

5. **Run the development server:**

npm run dev
Open http://localhost:3000 in your browser.

## 🔒 Concurrency Strategy (POST /api/reservations)

The core challenge of this system is ensuring that if two users attempt to reserve the last remaining unit of an item at the exact same millisecond, only one request succeeds.

To achieve strict correctness under heavy concurrency, this implementation uses PostgreSQL Row-Level Locking (SELECT ... FOR UPDATE) executed via a Prisma Interactive Transaction.

**How it works:**
1. When a POST request hits /api/reservations, an interactive database transaction opens.

2. We query the stock table using a raw SELECT * FROM "Stock" WHERE "productId" = $1 AND "warehouseId" = $2 FOR UPDATE statement.

3. The FOR UPDATE clause immediately locks that specific inventory row. Any competing request trying to read or modify this row must wait in line.

4. The system calculates the available units: Available = Total Units - Reserved Units.

5. If Available >= Requested Quantity, a row is created in the Reservation table with a pending status and a 10-minute expiration timestamp, and the reservedUnits in the Stock table are incremented.

6. If stock is insufficient, the transaction safely aborts and throws a 409 Conflict error to the second user.

## ⏳ Reservation Expiry Mechanism
Reservations hold items for a strict 10-minute window. If the customer fails to pay or abandons the cart, those resources must be freed.

**Strategy: Lazy Cleanup on Read (with Optional Background Worker)**
To optimize server resources and maintain zero overhead on the free tier, we implement a Lazy Cleanup on Read model:

 - Whenever a user requests a product listing (GET /api/products) or attempts to interact with stock, the server automatically scans for records where expiresAt < NOW() and status is pending.

 - Any expired records found are systematically updated to released, and their corresponding stock count is returned to the pool.

 - **Trade-off:** This avoids running constant background servers or paying for heavy cron services on a free tier while guaranteeing data accuracy whenever an operational decision is made.

 ## 🔀 API Endpoints Implemented

### 📦 Products & Infrastructure
* **`GET /api/products`**
    * **Description:** Lists all seeded products along with their real-time available stock levels mapped per warehouse.
* **`GET /api/warehouses`**
    * **Description:** Lists details for all active fulfillment warehouses in the system.

### ⏳ Reservation Actions
* **`POST /api/reservations`**
    * **Description:** Places a temporary 10-minute lock on requested inventory. Safely returns a `409 Conflict` status if stock runs out concurrently.
* **`POST /api/reservations/:id/confirm`**
    * **Description:** Finalizes the user order. Converts the hold into a permanent sale and permanently decrements total warehouse stock. Returns a `410 Gone` error if the 10-minute timer ran out.
* **`POST /api/reservations/:id/release`**
    * **Description:** Immediately voids a pending hold and returns the reserved items back into the pool if a user explicitly cancels checkout early.



## 🧠 Architectural Trade-offs & Future Improvements
- **Redis for Locking:** For a massive global scale, implementing a distributed lock system via Redis (using Upstash) would decouple safety from our relational database layer, drastically reducing load on our Postgres connection pool.

- **Idempotency:** In production, adding an Idempotency-Key header mapped inside a Redis cache would prevent duplicate charges if a user double-clicks the purchase button under weak network connections.