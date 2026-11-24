import { randomBytes, timingSafeEqual } from 'crypto';
import { Request, Response, Express } from 'express';
import { Server } from 'socket.io';
import { AppDatabase, getDB } from './db';
import { requireAdmin, setupAdminAuth } from './adminAuth';

const VALID_TRANSITIONS: Record<string, string[]> = {
  Placed: ['InProgress', 'Cancelled'],
  InProgress: ['Completed'],
  Completed: ['CheckedOut'],
};
const MAX_QUANTITY = 5;
type SalonMode = 'auto' | 'open' | 'closed';

async function salonStatus(db: AppDatabase) {
  const setting = await db.get<{ mode: SalonMode }>('SELECT mode FROM salon_settings WHERE id = 1');
  const mode = setting?.mode ?? 'auto';
  if (mode === 'open') return { isOpen: true, mode };
  if (mode === 'closed') return { isOpen: false, mode };

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const hours = Number(parts.find((part) => part.type === 'hour')?.value);
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value);
  return { isOpen: !(hours < 9 || hours >= 20 || (hours === 19 && minutes >= 45)), mode };
}

function todayFilter(db: AppDatabase, column: string) {
  return db.isPostgres
    ? `(${column} AT TIME ZONE 'UTC')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`
    : `date(${column}) = date('now')`;
}

function orderIdFrom(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid order or service ID' });
    return null;
  }
  return id;
}

async function orderWithItems(db: AppDatabase, id: number) {
  const order = await db.get<any>('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) return undefined;
  const items = await db.all('SELECT * FROM order_items WHERE order_id = ?', [id]);
  return { ...order, items };
}

function publicOrder(order: any) {
  if (!order) return order;
  const { customer_phone: _phone, cancel_token: _token, ...safe } = order;
  return safe;
}

function cancelTokenMatches(supplied: unknown, expected: unknown) {
  if (typeof supplied !== 'string' || typeof expected !== 'string' || !expected) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function setupRoutes(app: Express, io: Server) {
  setupAdminAuth(app);
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      await getDB().get('SELECT 1 AS healthy');
      res.json({ status: 'ok', salonOpen: (await salonStatus(getDB())).isOpen });
    } catch (err) {
      console.error('GET /api/health error:', err);
      res.status(503).json({ status: 'error', error: 'Database unavailable' });
    }
  });

  app.get('/api/salon/status', async (_req: Request, res: Response) => {
    try {
      res.json(await salonStatus(getDB()));
    } catch (err) {
      console.error('GET /api/salon/status error:', err);
      res.status(500).json({ error: 'Failed to fetch salon status' });
    }
  });

  app.patch('/api/admin/salon/status', requireAdmin, async (req: Request, res: Response) => {
    const mode = req.body?.mode;
    if (!['auto', 'open', 'closed'].includes(mode)) {
      res.status(400).json({ error: 'Mode must be auto, open, or closed' });
      return;
    }
    try {
      const db = getDB();
      await db.run('UPDATE salon_settings SET mode = ? WHERE id = 1', [mode]);
      const status = await salonStatus(db);
      io.emit('salon:status', status);
      res.json(status);
    } catch (err) {
      console.error('PATCH /api/admin/salon/status error:', err);
      res.status(500).json({ error: 'Failed to update salon status' });
    }
  });

  app.get('/api/services', async (_req: Request, res: Response) => {
    try {
      res.json(await getDB().all('SELECT * FROM services ORDER BY category, name'));
    } catch (err) {
      console.error('GET /api/services error:', err);
      res.status(500).json({ error: 'Failed to fetch services' });
    }
  });

  app.post('/api/services', async (req: Request, res: Response) => {
    try {
      const db = getDB();
      const { name, category, price, duration, description, type } = req.body ?? {};
      const serviceType = type || 'Standard';
      if (typeof name !== 'string' || !name.trim() || !category || price === undefined || duration === undefined) {
        res.status(400).json({ error: 'Name, category, price, and duration are required' }); return;
      }
      if (!['Hair', 'Skin', 'Nails', 'Spa'].includes(category) || !['Quick', 'Standard', 'Premium'].includes(serviceType)) {
        res.status(400).json({ error: 'Invalid category or service type' }); return;
      }
      if (!Number.isInteger(Number(price)) || Number(price) <= 0 || !Number.isInteger(Number(duration)) || Number(duration) <= 0) {
        res.status(400).json({ error: 'Price and duration must be positive whole numbers' }); return;
      }

      const result = await db.run(
        'INSERT INTO services (name, category, price, duration, description, type) VALUES (?, ?, ?, ?, ?, ?)',
        [name.trim(), category, Number(price), Number(duration), typeof description === 'string' ? description.trim() : '', serviceType],
      );
      const service = await db.get('SELECT * FROM services WHERE id = ?', [result.lastInsertRowid]);
      io.emit('service:created', service);
      res.status(201).json(service);
    } catch (err) {
      console.error('POST /api/services error:', err);
      res.status(500).json({ error: 'Failed to create service' });
    }
  });

  app.put('/api/services/:id', async (req: Request, res: Response) => {
    try {
      const db = getDB();
      const id = orderIdFrom(req, res);
      if (id === null) return;
      const existing = await db.get<any>('SELECT * FROM services WHERE id = ?', [id]);
      if (!existing) { res.status(404).json({ error: 'Service not found' }); return; }

      const { name = existing.name, category = existing.category, price = existing.price,
        duration = existing.duration, description = existing.description, type = existing.type,
        is_available = existing.is_available } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim() || !['Hair', 'Skin', 'Nails', 'Spa'].includes(category) ||
          !['Quick', 'Standard', 'Premium'].includes(type) || !Number.isInteger(Number(price)) || Number(price) <= 0 ||
          !Number.isInteger(Number(duration)) || Number(duration) <= 0 || ![0, 1, false, true].includes(is_available)) {
        res.status(400).json({ error: 'Invalid service details' }); return;
      }

      await db.run(`UPDATE services SET name = ?, category = ?, price = ?, duration = ?,
        description = ?, type = ?, is_available = ? WHERE id = ?`,
      [name.trim(), category, Number(price), Number(duration), typeof description === 'string' ? description.trim() : '', type, Number(is_available), id]);
      const updated = await db.get('SELECT * FROM services WHERE id = ?', [id]);
      io.emit('service:updated', updated);
      res.json(updated);
    } catch (err) {
      console.error('PUT /api/services/:id error:', err);
      res.status(500).json({ error: 'Failed to update service' });
    }
  });

  app.delete('/api/services/:id', async (req: Request, res: Response) => {
    try {
      const db = getDB();
      const id = orderIdFrom(req, res);
      if (id === null) return;
      const existing = await db.get('SELECT id FROM services WHERE id = ?', [id]);
      if (!existing) { res.status(404).json({ error: 'Service not found' }); return; }
      await db.run('DELETE FROM services WHERE id = ?', [id]);
      io.emit('service:deleted', { id });
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /api/services/:id error:', err);
      res.status(500).json({ error: 'Failed to delete service' });
    }
  });

  app.get('/api/orders', async (_req: Request, res: Response) => {
    try {
      const db = getDB();
      const orders = await db.all<any>(`SELECT * FROM orders
        WHERE status IN ('Placed', 'InProgress', 'Completed') AND ${todayFilter(db, 'created_at')}
        ORDER BY token_number ASC`);
      const result = await Promise.all(orders.map(async (order) => publicOrder({
        ...order, items: await db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id]),
      })));
      res.json(result);
    } catch (err) {
      console.error('GET /api/orders error:', err);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  app.get('/api/orders/:id', async (req: Request, res: Response) => {
    try {
      const id = orderIdFrom(req, res);
      if (id === null) return;
      const order = await orderWithItems(getDB(), id);
      if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
      res.json(publicOrder(order));
    } catch (err) {
      console.error('GET /api/orders/:id error:', err);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  app.post('/api/orders', async (req: Request, res: Response) => {
    try {
      const db = getDB();
      const { customer_name, customer_phone, items } = req.body ?? {};
      if (typeof customer_name !== 'string' || !customer_name.trim()) {
        res.status(400).json({ error: 'Customer name is required' }); return;
      }
      if (typeof customer_phone !== 'string' || !/^\d{10}$/.test(customer_phone.trim())) {
        res.status(400).json({ error: 'Valid 10-digit phone number is required' }); return;
      }
      if (!(await salonStatus(db)).isOpen) {
        res.status(400).json({ error: 'Salon is closed. Bookings available 9 AM – 7:45 PM.' }); return;
      }
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'At least one service is required' }); return;
      }

      const quantities = new Map<number, number>();
      const validatedItems: Array<{ service_id: number; service_name: string; quantity: number; price: number; duration: number }> = [];
      let total = 0;
      for (const item of items) {
        const serviceId = Number(item?.service_id);
        const quantity = Number(item?.quantity);
        if (!Number.isInteger(serviceId) || serviceId < 1 || !Number.isInteger(quantity) || quantity < 1 ||
            (quantities.get(serviceId) ?? 0) + quantity > MAX_QUANTITY) {
          res.status(400).json({ error: `Invalid quantity. Must be 1–${MAX_QUANTITY} per service.` }); return;
        }
        quantities.set(serviceId, (quantities.get(serviceId) ?? 0) + quantity);
        const service = await db.get<any>('SELECT * FROM services WHERE id = ?', [serviceId]);
        if (!service) { res.status(400).json({ error: `Service not found (ID: ${serviceId})` }); return; }
        if (!service.is_available) { res.status(400).json({ error: `"${service.name}" is currently unavailable` }); return; }
        validatedItems.push({ service_id: service.id, service_name: service.name, quantity, price: service.price, duration: service.duration });
        total += service.price * quantity;
      }

      const cancelToken = randomBytes(24).toString('base64url');
      const fullOrder = await db.transaction(async (transaction) => {
        if (transaction.isPostgres) await transaction.run('SELECT pg_advisory_xact_lock(74519302)');
        const today = todayFilter(transaction, 'created_at');
        const lastToken = await transaction.get<any>(`SELECT COALESCE(MAX(token_number), 0) AS last_token
          FROM orders WHERE ${today}`);
        const result = await transaction.run(`INSERT INTO orders
          (token_number, customer_name, customer_phone, status, total, cancel_token) VALUES (?, ?, ?, 'Placed', ?, ?)`,
        [Number(lastToken?.last_token ?? 0) + 1, customer_name.trim(), customer_phone.trim(), total, cancelToken]);
        for (const item of validatedItems) {
          await transaction.run(`INSERT INTO order_items
            (order_id, service_id, service_name, quantity, price, duration) VALUES (?, ?, ?, ?, ?, ?)`,
          [result.lastInsertRowid, item.service_id, item.service_name, item.quantity, item.price, item.duration]);
        }
        return orderWithItems(transaction, result.lastInsertRowid);
      });
      io.emit('order:new', publicOrder(fullOrder));
      res.status(201).json({ ...publicOrder(fullOrder), cancel_token: fullOrder.cancel_token });
    } catch (err) {
      console.error('POST /api/orders error:', err);
      res.status(500).json({ error: 'Failed to create order' });
    }
  });

  app.patch('/api/orders/:id/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const db = getDB();
      const id = orderIdFrom(req, res);
      if (id === null) return;
      const order = await db.get<any>('SELECT * FROM orders WHERE id = ?', [id]);
      if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
      const validNext = VALID_TRANSITIONS[order.status];
      if (!validNext?.includes(req.body?.status)) {
        res.status(400).json({ error: `Cannot transition from "${order.status}" to "${req.body?.status}"` }); return;
      }
      await db.run("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.body.status, id]);
      const updated = publicOrder(await orderWithItems(db, id));
      io.emit('order:updated', updated);
      res.json(updated);
    } catch (err) {
      console.error('PATCH /api/orders/:id/status error:', err);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  });

  app.patch('/api/orders/:id/cancel', async (req: Request, res: Response) => {
    try {
      const db = getDB();
      const id = orderIdFrom(req, res);
      if (id === null) return;
      const order = await db.get<any>('SELECT * FROM orders WHERE id = ?', [id]);
      if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
      if (order.status !== 'Placed') {
        res.status(400).json({ error: 'Can only cancel bookings with "Placed" status' }); return;
      }
      if (!cancelTokenMatches(req.body?.cancel_token, order.cancel_token)) {
        res.status(403).json({ error: 'This booking can only be cancelled from the device that placed it.' }); return;
      }
      await db.run("UPDATE orders SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
      const updated = publicOrder(await orderWithItems(db, id));
      io.emit('order:updated', updated);
      res.json(updated);
    } catch (err) {
      console.error('PATCH /api/orders/:id/cancel error:', err);
      res.status(500).json({ error: 'Failed to cancel order' });
    }
  });

  app.get('/api/admin/stats', async (_req: Request, res: Response) => {
    try {
      const db = getDB();
      const today = todayFilter(db, 'created_at');
      const todayOrder = todayFilter(db, 'o.created_at');
      const [orders, revenue, completed, top] = await Promise.all([
        db.get<any>(`SELECT COUNT(*) AS count FROM orders WHERE ${today}`),
        db.get<any>(`SELECT COALESCE(SUM(total), 0) AS revenue FROM orders WHERE ${today} AND status != 'Cancelled'`),
        db.get<any>(`SELECT COUNT(*) AS count FROM orders WHERE ${today} AND status IN ('Completed', 'CheckedOut')`),
        db.get<any>(`SELECT oi.service_name, SUM(oi.quantity) AS total_qty
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE ${todayOrder} AND o.status != 'Cancelled'
          GROUP BY oi.service_name ORDER BY total_qty DESC LIMIT 1`),
      ]);
      res.json({
        totalOrders: Number(orders?.count ?? 0), totalRevenue: Number(revenue?.revenue ?? 0),
        servicesCompleted: Number(completed?.count ?? 0), topService: top?.service_name ?? null,
      });
    } catch (err) {
      console.error('GET /api/admin/stats error:', err);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });
}
