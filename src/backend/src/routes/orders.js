import { Router } from 'express'
import { authMiddleware, adminOnly, adminOrStore } from '../middleware/auth.js'
import {
  getOrders, createOrder, updateOrderStatus,
  uploadPoD, uploadInvoice, deleteOrder, markReadyForPickup,
  getDashboardFinancials, getCashByVehicle,
} from '../controllers/ordersController.js'

const router = Router()

// ── Dashboard financiero (admin) ─────────────────────────────────────────────
router.get('/financials',      authMiddleware, adminOnly, getDashboardFinancials)
router.get('/cash-by-vehicle', authMiddleware, adminOnly, getCashByVehicle)

// Rider + Admin + Store
router.get('/',              authMiddleware,              getOrders)
router.put('/:id/status',    authMiddleware,              updateOrderStatus)
router.post('/:id/pod',      authMiddleware,              uploadPoD)
router.post('/:id/invoice',  authMiddleware, adminOrStore, uploadInvoice)

// Store: marcar pedido como "Listo para Retiro"
router.patch('/:id/ready',   authMiddleware, adminOrStore, markReadyForPickup)

// Admin + Store (store solo crea sus propios pedidos)
router.post('/',             authMiddleware, adminOrStore, createOrder)

// Admin only
router.delete('/:id',        authMiddleware, adminOnly,    deleteOrder)

export default router
