import { Router } from 'express'
import { authMiddleware, adminOnly, adminOrStore } from '../middleware/auth.js'
import { ensureOrderLocationScope } from '../middleware/locationScope.js'
import { attachMapPolicy, requireCompanyMapAccess } from '../middleware/mapAccess.js'
import {
  getOrders, createOrder, updateOrderStatus,
  uploadPoD, uploadInvoice, deleteOrder, markReadyForPickup,
  getDashboardFinancials, getCashByVehicle,
} from '../controllers/ordersController.js'

const router = Router()

router.use(authMiddleware)
router.use(attachMapPolicy)

// ── Dashboard financiero (admin) ─────────────────────────────────────────────
router.get('/financials',      adminOnly, getDashboardFinancials)
router.get(
  '/cash-by-vehicle',
  requireCompanyMapAccess({ capabilities: ['map.view.cash'] }),
  getCashByVehicle,
)

// Rider + Admin + Store
router.get('/',                              getOrders)
router.put('/:id/status',                    updateOrderStatus)
router.post('/:id/pod',                      uploadPoD)
router.post('/:id/invoice',  adminOrStore,   uploadInvoice)

// Store: marcar pedido como "Listo para Retiro"
router.patch('/:id/ready',   adminOrStore,   markReadyForPickup)

// Admin + Store (store solo crea sus propios pedidos)
router.post('/',             adminOrStore, ensureOrderLocationScope, createOrder)

// Admin only
router.delete('/:id',        adminOnly,    deleteOrder)

export default router
