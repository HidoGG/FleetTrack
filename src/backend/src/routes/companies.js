import { Router } from 'express'
import { authMiddleware, superAdminOnly } from '../middleware/auth.js'
import {
  listCompanies,
  createCompany,
  updateCompany,
  setCompanyState,
} from '../controllers/companiesController.js'
import { listProfiles, createProfile } from '../controllers/profilesController.js'

const router = Router()

router.use(authMiddleware, superAdminOnly)

router.get('/',                             listCompanies)
router.post('/',                            createCompany)
router.put('/:id',                          updateCompany)
router.patch('/:id/state',                  setCompanyState)
router.get('/:companyId/profiles',          listProfiles)
router.post('/:companyId/profiles',         createProfile)

export default router
