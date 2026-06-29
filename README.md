# Delivery Backend

Node.js + Express backend for a rider delivery app.

Features:

- Register rider/user
- Login using Iqama ID and password
- JWT protected routes
- MongoDB with Mongoose
- Cloudinary photo uploads
- Store orders with pickup photo, delivery photo, times, and calculated duration

## Folder structure

```txt
src/
  config/
    cloudinary.js
    db.js
  controllers/
    auth.controller.js
    order.controller.js
  middleware/
    auth.middleware.js
    error.middleware.js
    upload.middleware.js
  models/
    Order.js
    User.js
  routes/
    auth.routes.js
    order.routes.js
  utils/
    asyncHandler.js
    generateToken.js
    uploadToCloudinary.js
  app.js
  server.js
```

## Setup

Install packages:

```bash
npm install
```

Create `.env` from example:

```bash
cp .env.example .env
```

Fill these values:

```env
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_long_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Run development server:

```bash
npm run dev
```

Server runs on:

```txt
http://localhost:5000
```

## API

### Health check

```http
GET /api/health
```

### Register

```http
POST /api/auth/register
Content-Type: application/json
```

Body:

```json
{
  "name": "Aaqib",
  "iqamaId": "123456789",
  "password": "123456"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

Body:

```json
{
  "iqamaId": "123456789",
  "password": "123456"
}
```

Response includes token. Use it in protected routes:

```http
Authorization: Bearer YOUR_TOKEN
```

### Create order with pickup and delivery photos

```http
POST /api/orders
Authorization: Bearer YOUR_TOKEN
Content-Type: multipart/form-data
```

Form fields:

```txt
pickupPhoto: image file
deliveryPhoto: image file
pickupTime: 2026-06-28T10:00:00.000Z
deliveryTime: 2026-06-28T10:15:30.000Z
notes: optional text
```

### Get my orders

```http
GET /api/orders/my-orders
Authorization: Bearer YOUR_TOKEN
```

### Get single order

```http
GET /api/orders/:id
Authorization: Bearer YOUR_TOKEN
```

### Delete order

```http
DELETE /api/orders/:id
Authorization: Bearer YOUR_TOKEN
```

## React Native upload example

```ts
const formData = new FormData();

formData.append("pickupPhoto", {
  uri: pickupPhoto.uri,
  name: "pickup.jpg",
  type: "image/jpeg",
} as any);

formData.append("deliveryPhoto", {
  uri: deliveryPhoto.uri,
  name: "delivery.jpg",
  type: "image/jpeg",
} as any);

formData.append("pickupTime", pickupPhoto.time.toISOString());
formData.append("deliveryTime", deliveryPhoto.time.toISOString());

const response = await fetch("http://YOUR_LOCAL_IP:5000/api/orders", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});

const data = await response.json();
```

For Android physical phone, do not use `localhost`. Use your computer LAN IP, for example:

```txt
http://192.168.1.20:5000
```
