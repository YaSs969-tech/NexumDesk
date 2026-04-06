resource "kubernetes_namespace" "nexumdesk" {
  metadata {
    name = var.namespace
  }
}

resource "kubernetes_deployment" "backend" {
  metadata {
    name      = "nexumdesk-backend"
    namespace = kubernetes_namespace.nexumdesk.metadata[0].name
    labels = {
      app = "nexumdesk-backend"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "nexumdesk-backend"
      }
    }

    template {
      metadata {
        labels = {
          app = "nexumdesk-backend"
        }
      }

      spec {
        container {
          name  = "backend"
          image = var.backend_image

          env {
            name  = "NODE_ENV"
            value = "production"
          }

          env {
            name  = "PORT"
            value = "3001"
          }

          env {
            name  = "SQLITE_FILE"
            value = "/data/nexumdesk.db"
          }

          env {
            name  = "JWT_SECRET"
            value = var.jwt_secret
          }

          port {
            container_port = 3001
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "backend" {
  metadata {
    name      = "nexumdesk-backend"
    namespace = kubernetes_namespace.nexumdesk.metadata[0].name
  }

  spec {
    selector = {
      app = "nexumdesk-backend"
    }

    port {
      port        = 5000
      target_port = 3001
    }
  }
}

resource "kubernetes_deployment" "frontend" {
  metadata {
    name      = "nexumdesk-frontend"
    namespace = kubernetes_namespace.nexumdesk.metadata[0].name
    labels = {
      app = "nexumdesk-frontend"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "nexumdesk-frontend"
      }
    }

    template {
      metadata {
        labels = {
          app = "nexumdesk-frontend"
        }
      }

      spec {
        container {
          name  = "frontend"
          image = var.frontend_image

          port {
            container_port = 80
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "frontend" {
  metadata {
    name      = "nexumdesk-frontend"
    namespace = kubernetes_namespace.nexumdesk.metadata[0].name
  }

  spec {
    type = "LoadBalancer"

    selector = {
      app = "nexumdesk-frontend"
    }

    port {
      port        = 80
      target_port = 80
    }
  }
}
