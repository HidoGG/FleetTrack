import { canViewCompanyMap, resolveMapPolicy } from '../services/mapPolicy.js'

export function attachMapPolicy(req, _res, next) {
  req.mapPolicy = resolveMapPolicy(req.profile)
  next()
}

export function requireCompanyMapAccess(options = {}) {
  return (req, res, next) => {
    const policy = req.mapPolicy ?? resolveMapPolicy(req.profile)
    req.mapPolicy = policy

    if (!canViewCompanyMap(policy, options)) {
      return res.status(403).json({ error: 'No autorizado para acceder al mapa de la empresa' })
    }

    next()
  }
}
