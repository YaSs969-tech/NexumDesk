variable "kubeconfig_path" {
  description = "Path to kubeconfig file"
  type        = string
  default     = "~/.kube/config"
}

variable "namespace" {
  description = "Namespace for NexumDesk"
  type        = string
  default     = "nexumdesk"
}

variable "backend_image" {
  description = "Container image for backend"
  type        = string
  default     = "ghcr.io/your-org/nexumdesk-backend:latest"
}

variable "frontend_image" {
  description = "Container image for frontend"
  type        = string
  default     = "ghcr.io/your-org/nexumdesk-frontend:latest"
}

variable "jwt_secret" {
  description = "JWT secret used by backend"
  type        = string
  sensitive   = true
  default     = "change-me-in-production"
}
