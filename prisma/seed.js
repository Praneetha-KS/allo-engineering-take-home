// prisma/seed.js

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // Delete old data
  await prisma.reservation.deleteMany()
  await prisma.inventory.deleteMany()
  await prisma.product.deleteMany()
  await prisma.warehouse.deleteMany()

  // Create warehouses
  const newYorkWarehouse = await prisma.warehouse.create({
    data: {
      name: 'New York Warehouse',
      location: 'New York, USA',
    },
  })

  const losAngelesWarehouse = await prisma.warehouse.create({
    data: {
      name: 'Los Angeles Warehouse',
      location: 'Los Angeles, USA',
    },
  })

  // Create products
  await prisma.product.createMany({
    data: [
      {
        name: 'Running Shoes',
        description: 'Lightweight running shoes',
        price: 89.99,
        imageUrl:
          'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
      },
      {
        name: 'Winter Jacket',
        description: 'Warm jacket for winter',
        price: 149.99,
        imageUrl:
          'https://images.unsplash.com/photo-1523381210434-271e8be1f52b',
      },
      {
        name: 'Classic Hoodie',
        description: 'Comfortable cotton hoodie',
        price: 59.99,
        imageUrl:
          'https://images.unsplash.com/photo-1556821840-3a63f95609a7',
      },
      {
        name: 'Sports Backpack',
        description: 'Durable travel backpack',
        price: 79.99,
        imageUrl:
          'https://images.unsplash.com/photo-1547949003-9792a18a2601',
      },
      {
        name: 'Baseball Cap',
        description: 'Adjustable everyday cap',
        price: 24.99,
        imageUrl:
          'https://images.unsplash.com/photo-1521369909029-2afed882baee',
      },
    ],
  })

  console.log('✅ Products created')

  // Get products
  const allProducts = await prisma.product.findMany()

  // Create inventory
  for (const product of allProducts) {
    await prisma.inventory.create({
      data: {
        productId: product.id,
        warehouseId: newYorkWarehouse.id,
        totalUnits: Math.floor(Math.random() * 50) + 20,
        reservedUnits: 0,
      },
    })

    await prisma.inventory.create({
      data: {
        productId: product.id,
        warehouseId: losAngelesWarehouse.id,
        totalUnits: Math.floor(Math.random() * 50) + 20,
        reservedUnits: 0,
      },
    })
  }

  console.log('✅ Inventory created')
  console.log('🎉 Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })