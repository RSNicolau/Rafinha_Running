import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductCategory, StoreOrderStatus } from '@prisma/client';

@Injectable()
export class StoreService {
  constructor(private prisma: PrismaService) {}

  // ── PRODUTOS ──

  async listPublicProducts(coachId: string) {
    return this.prisma.product.findMany({
      where: { coachId, active: true },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        priceInCents: true,
        images: true,
        sizes: true,
        colors: true,
        totalStock: true,
        reserved: true,
        featured: true,
      },
    });
  }

  async listCoachProducts(coachId: string) {
    return this.prisma.product.findMany({
      where: { coachId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { orders: true } },
      },
    });
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  async createProduct(coachId: string, data: {
    name: string;
    description?: string;
    category: ProductCategory;
    priceInCents: number;
    images?: string[];
    sizes?: string[];
    colors?: string[];
    totalStock?: number;
    featured?: boolean;
  }) {
    return this.prisma.product.create({
      data: {
        coachId,
        name: data.name,
        description: data.description,
        category: data.category,
        priceInCents: data.priceInCents,
        images: data.images ?? [],
        sizes: data.sizes ?? [],
        colors: data.colors ?? [],
        totalStock: data.totalStock ?? 0,
        featured: data.featured ?? false,
      },
    });
  }

  async updateProduct(id: string, coachId: string, data: Partial<{
    name: string;
    description: string;
    category: ProductCategory;
    priceInCents: number;
    images: string[];
    sizes: string[];
    colors: string[];
    totalStock: number;
    active: boolean;
    featured: boolean;
  }>) {
    const product = await this.prisma.product.findFirst({ where: { id, coachId } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return this.prisma.product.update({ where: { id }, data });
  }

  async deleteProduct(id: string, coachId: string) {
    const product = await this.prisma.product.findFirst({ where: { id, coachId } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    // Soft delete
    return this.prisma.product.update({ where: { id }, data: { active: false } });
  }

  // ── PEDIDOS ──

  async createOrder(data: {
    productId: string;
    athleteId?: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    size?: string;
    color?: string;
    quantity: number;
    shippingAddress?: string;
    notes?: string;
  }) {
    const product = await this.prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    if (!product.active) throw new BadRequestException('Produto indisponível');

    const available = product.totalStock - product.reserved;
    if (available < data.quantity) {
      throw new BadRequestException(`Estoque insuficiente. Disponível: ${available}`);
    }

    const totalInCents = product.priceInCents * data.quantity;

    const order = await this.prisma.$transaction(async (tx) => {
      // Reserve stock
      await tx.product.update({
        where: { id: data.productId },
        data: { reserved: { increment: data.quantity } },
      });

      return tx.storeOrder.create({
        data: {
          productId: data.productId,
          athleteId: data.athleteId,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          size: data.size,
          color: data.color,
          quantity: data.quantity,
          totalInCents,
          shippingAddress: data.shippingAddress,
          notes: data.notes,
          status: 'PENDING_PAYMENT',
        },
        include: { product: { select: { name: true, priceInCents: true } } },
      });
    });

    return order;
  }

  async listCoachOrders(coachId: string, status?: StoreOrderStatus) {
    return this.prisma.storeOrder.findMany({
      where: {
        product: { coachId },
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { name: true, category: true, priceInCents: true } },
      },
    });
  }

  async updateOrderStatus(orderId: string, coachId: string, status: StoreOrderStatus) {
    const order = await this.prisma.storeOrder.findFirst({
      where: { id: orderId, product: { coachId } },
      include: { product: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    // If cancelling, release reserved stock
    if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
      await this.prisma.product.update({
        where: { id: order.productId },
        data: { reserved: { decrement: order.quantity } },
      });
    }

    // If confirming payment, deduct from total stock
    if (status === 'PAID' && order.status === 'PENDING_PAYMENT') {
      await this.prisma.product.update({
        where: { id: order.productId },
        data: {
          totalStock: { decrement: order.quantity },
          reserved: { decrement: order.quantity },
        },
      });
    }

    return this.prisma.storeOrder.update({
      where: { id: orderId },
      data: { status },
    });
  }

  async getOrderById(orderId: string) {
    return this.prisma.storeOrder.findUnique({
      where: { id: orderId },
      include: { product: true },
    });
  }

  // Stats for dashboard
  async getStoreStats(coachId: string) {
    const [products, orders, revenue] = await Promise.all([
      this.prisma.product.count({ where: { coachId, active: true } }),
      this.prisma.storeOrder.count({ where: { product: { coachId } } }),
      this.prisma.storeOrder.aggregate({
        where: { product: { coachId }, status: { in: ['PAID', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } },
        _sum: { totalInCents: true },
      }),
    ]);
    return {
      activeProducts: products,
      totalOrders: orders,
      revenueInCents: revenue._sum.totalInCents ?? 0,
    };
  }
}
