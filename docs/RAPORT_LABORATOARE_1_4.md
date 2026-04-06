# Raport Lucrari De Laborator 1-4

## Date Generale

- Proiect: `NexumDesk`
- Tip aplicatie: platforma de management al incidentelor IT
- Tehnologii principale:
  - backend: `Node.js`, `Express`, `TypeScript`, `SQLite`
  - frontend: `React`, `Vite`, `TypeScript`
  - containerizare: `Docker`, `Docker Compose`
  - orchestrare: `Kubernetes`
  - cloud si CI/CD: `GitHub Actions`, `Google Cloud`, `GKE`, `Artifact Registry`

Acest raport este redactat pe baza cerintelor din lucrarile de laborator si a implementarii efective realizate in proiect. Unde este necesar, au fost lasate zone clare pentru inserarea capturilor de ecran.

## Scopul Proiectului

Aplicatia `NexumDesk` a fost dezvoltata pentru gestionarea ciclului de viata al incidentelor IT. Sistemul permite autentificarea utilizatorilor, lucrul pe roluri, crearea si asignarea incidentelor, urmarirea SLA-urilor, generarea de rapoarte si rularea aplicatiei atat local, cat si in containere Docker sau in Kubernetes.

## Lucrarea Nr. 1
### Tema

Identificarea sau realizarea unei aplicatii software care va fi utilizata in lucrarile urmatoare, impreuna cu analiza arhitecturii si a componentelor principale.

### Ce am realizat

In cadrul lucrarii nr. 1 a fost ales si implementat proiectul `NexumDesk`, o aplicatie web completa pentru managementul incidentelor. Aplicatia este impartita in doua componente principale:

- un backend REST API pentru logica de business si persistenta datelor
- un frontend web pentru interactiunea utilizatorului cu sistemul

### Functionalitati implementate

- autentificare si autorizare pe baza de roluri
- creare, vizualizare, actualizare si gestionare incidente
- asignare incidente catre ingineri
- monitorizare SLA
- configurare categorii si subcategorii
- panou administrativ
- rapoarte pentru manager
- stocare date in `SQLite`

### Arhitectura proiectului

Structura principala a proiectului este urmatoarea:

```text
backend/      API REST + logica de business + baza de date SQLite
frontend/     interfata grafica React
k8s/          manifeste Kubernetes
docs/         documentatie tehnica
.github/      workflow-uri CI/CD
infra/        configurari Terraform
```

### Pasi realizati

1. A fost definita ideea proiectului si domeniul aplicatiei.
2. A fost stabilita arhitectura client-server.
3. A fost implementat backend-ul in `Express + TypeScript`.
4. A fost implementat frontend-ul in `React + Vite`.
5. A fost configurata persistenta datelor cu `SQLite`.
6. A fost organizata structura proiectului pentru extindere ulterioara.

### Rezultat

La finalul lucrarii nr. 1 a rezultat o aplicatie functionala care poate fi rulata local si extinsa pentru etapele urmatoare de containerizare, orchestrare si automatizare CI/CD.

### Spatii pentru capturi de ecran

- Fig. 1 - [INSEREAZA SCREENSHOT CU STRUCTURA PROIECTULUI IN IDE]
- Fig. 2 - [INSEREAZA SCREENSHOT CU PAGINA PRINCIPALA A APLICATIEI]
- Fig. 3 - [INSEREAZA SCREENSHOT CU PAGINA DE LOGIN SAU DASHBOARD]

## Lucrarea Nr. 2
### Tema

Containerizarea aplicatiei si rularea ei prin `Docker` si `Docker Compose`.

### Ce am realizat

In aceasta etapa, proiectul a fost adaptat pentru rulare in containere, astfel incat backend-ul si frontend-ul sa poata fi pornite intr-un mod standardizat si reproductibil.

### Implementari efectuate

- a fost creat si ajustat `Dockerfile` pentru backend
- a fost creat si corectat `Dockerfile` pentru frontend
- a fost configurat `docker-compose.yml`
- au fost mapate porturile pentru accesarea aplicatiei
- a fost configurata persistenta bazei de date SQLite in Docker

### Probleme identificate si rezolvate

Pe parcursul testarii au fost identificate si corectate mai multe probleme:

- eroare `sqlite3 node_sqlite3.node: Exec format error`
  - cauza: fisiere `node_modules` de pe Windows suprascriau continutul din containerul Linux
  - solutie: au fost eliminate bind mount-urile nepotrivite pentru backend si frontend

- eroare `404 Not Found` in frontend
  - cauza: imaginea frontend pornea fara un build static corect
  - solutie: frontend-ul a fost reconstruit cu un `Dockerfile` multi-stage valid

- nepotrivire de port intre backend si Dockerfile
  - cauza: aplicatia backend expunea alt port decat cel configurat initial
  - solutie: configuratia a fost aliniata pentru rularea corecta

### Pasi realizati

1. A fost analizata aplicatia pentru separarea componentelor ce trebuie containerizate.
2. A fost creat un `Dockerfile` pentru backend.
3. A fost creat un `Dockerfile` pentru frontend.
4. A fost adaugat fisierul `docker-compose.yml`.
5. A fost pornita aplicatia cu comanda:

```bash
docker-compose up --build
```

6. A fost verificata functionarea backend-ului si a frontend-ului.
7. A fost verificata persistenta bazei de date in mediul Docker.

### Rezultat

Aplicatia poate fi pornita prin Docker Compose, iar datele sunt pastrate intre restart-uri datorita persistentei pe volum pentru baza de date SQLite.

### Spatii pentru capturi de ecran

- Fig. 4 - [INSEREAZA SCREENSHOT CU FISIERUL backend/Dockerfile]
- Fig. 5 - [INSEREAZA SCREENSHOT CU FISIERUL frontend/Dockerfile]
- Fig. 6 - [INSEREAZA SCREENSHOT CU FISIERUL docker-compose.yml]
- Fig. 7 - [INSEREAZA SCREENSHOT CU CONTAINERELE DOCKER RUNNING]
- Fig. 8 - [INSEREAZA SCREENSHOT CU APLICATIA DESCHISA DUPA docker-compose up]
- Fig. 9 - [INSEREAZA SCREENSHOT CU HEALTHCHECK SAU RASPUNSUL API]

## Lucrarea Nr. 3
### Tema

Lansarea aplicatiei pe platforma `Kubernetes` si verificarea functionarii acesteia.

### Ce am realizat

In cadrul lucrarii nr. 3 aplicatia a fost adaptata pentru rulare in Kubernetes prin manifestele din directorul `k8s/`. Au fost definite resursele necesare pentru namespace, deployment-uri, servicii, secrete si persistenta datelor.

### Resurse Kubernetes utilizate

- `Namespace`
- `Deployment` pentru backend
- `Deployment` pentru frontend
- `Service` pentru backend
- `Service` pentru frontend
- `Secret` pentru cheia `JWT`
- `PersistentVolumeClaim` pentru baza de date SQLite
- `Ingress` pentru expunerea aplicatiei

### Probleme identificate si rezolvate

- in configurarea initiala Kubernetes datele nu erau persistente
  - cauza: backend-ul folosea `emptyDir`
  - solutie: a fost introdus `PersistentVolumeClaim`

- baza de date copiata initial in Kubernetes a devenit corupta
  - cauza: copiere incompleta a fisierelor SQLite in modul WAL
  - solutie: a fost realizat checkpoint corect si restaurare a unei copii sanatoase

- autentificarea returna `401` deoarece utilizatorii lipsisera dupa recrearea podului
  - solutie: s-a refacut persistenta si s-au verificat datele existente in volum

- rollout-ul backend-ului in GKE ramanea blocat la actualizare
  - cauza: backend-ul foloseste `SQLite` pe volum `ReadWriteOnce`
  - solutie: strategia de deployment a fost schimbata la `Recreate`

### Pasi realizati

1. A fost creat namespace-ul `nexumdesk`.
2. A fost definit deployment-ul pentru backend.
3. A fost definit deployment-ul pentru frontend.
4. Au fost definite serviciile Kubernetes pentru ambele componente.
5. A fost adaugat secretul pentru `JWT_SECRET`.
6. A fost adaugat `PersistentVolumeClaim` pentru `/data/nexumdesk.db`.
7. A fost pornita aplicatia in cluster.
8. A fost verificat accesul la aplicatie prin port-forward sau serviciu expus.
9. A fost verificata persistenta datelor dupa restart-ul podurilor.

### Comenzi utilizate

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/backend-pvc.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/ingress.yaml
```

Verificare:

```bash
kubectl get pods -n nexumdesk
kubectl get svc -n nexumdesk
kubectl get ingress -n nexumdesk
```

### Rezultat

Aplicatia a fost lansata in Kubernetes si a putut fi accesata pentru validarea functionala. Persistenta datelor a fost asigurata prin PVC, iar configuratia a fost ajustata astfel incat deployment-ul sa fie stabil.

### Spatii pentru capturi de ecran

- Fig. 10 - [INSEREAZA SCREENSHOT CU FISIERUL k8s/namespace.yaml]
- Fig. 11 - [INSEREAZA SCREENSHOT CU FISIERUL k8s/backend.yaml]
- Fig. 12 - [INSEREAZA SCREENSHOT CU FISIERUL k8s/frontend.yaml]
- Fig. 13 - [INSEREAZA SCREENSHOT CU FISIERUL k8s/backend-pvc.yaml]
- Fig. 14 - [INSEREAZA SCREENSHOT CU POD-URILE RUNNING IN KUBERNETES]
- Fig. 15 - [INSEREAZA SCREENSHOT CU SERVICIILE SAU INGRESS-UL]
- Fig. 16 - [INSEREAZA SCREENSHOT CU APLICATIA DESCHISA DIN KUBERNETES]

## Lucrarea Nr. 4
### Tema

Familiarizarea cu procesul de creare a flow-urilor `CI/CD` si implementarea unui flow pe `Google Cloud` pentru deployment-ul aplicatiei pe `GKE`.

### Ce am realizat

Pentru lucrarea nr. 4 a fost implementat un pipeline `CI/CD` bazat pe `GitHub Actions` si integrat cu `Google Cloud Platform`.

In proiect exista doua componente principale:

- `CI`, responsabil pentru verificarea codului
- `CD`, responsabil pentru build, push si deployment in `GKE`

### Workflow-uri implementate

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- [`.github/workflows/cd-gcp-gke.yml`](../.github/workflows/cd-gcp-gke.yml)

### Ce face partea de CI

Workflow-ul `CI` executa:

- instalarea dependintelor
- build pentru backend
- build pentru frontend
- rularea testelor
- validarea manifestelor Kubernetes
- validarea configuratiilor Terraform

### Ce face partea de CD

Workflow-ul `CD GCP GKE` executa:

- autentificarea in Google Cloud
- configurarea `Artifact Registry`
- obtinerea credentialelor pentru clusterul `GKE`
- build pentru imaginea backend
- build pentru imaginea frontend
- push pentru imagini in `Artifact Registry`
- aplicarea manifestelor Kubernetes
- setarea imaginilor noi in deployment-uri
- asteptarea finalizarii rollout-ului

### Configurari realizate in Google Cloud

- a fost selectat proiectul:
  - `project-77af9e0c-c580-4f02-96a`

- au fost activate serviciile:
  - `artifactregistry.googleapis.com`
  - `container.googleapis.com`
  - `iamcredentials.googleapis.com`
  - `cloudresourcemanager.googleapis.com`

- a fost creat repository-ul:
  - `nexumdesk`

- a fost utilizat clusterul:
  - `nexumdesk-cluster`

- a fost creat service account-ul:
  - `github-deployer@project-77af9e0c-c580-4f02-96a.iam.gserviceaccount.com`

- a fost configurat `Workload Identity Pool`
- a fost configurat `OIDC Provider` pentru GitHub Actions

### Configurari realizate in GitHub

Au fost adaugate `Repository Variables`:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GAR_REPOSITORY`
- `GKE_CLUSTER`
- `GKE_LOCATION`

Au fost adaugate `Repository Secrets`:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `JWT_SECRET`

### Pasi realizati

1. A fost configurat proiectul Google Cloud.
2. Au fost activate API-urile necesare.
3. A fost pregatit `Artifact Registry`.
4. A fost pregatit clusterul `GKE`.
5. A fost configurata autentificarea GitHub Actions prin `Workload Identity Federation`.
6. A fost creat workflow-ul `cd-gcp-gke.yml`.
7. Au fost adaugate variabilele si secretele in GitHub.
8. A fost facut `push` in repository pentru declansarea automata a pipeline-ului.
9. A fost verificata rularea workflow-ului si rezolvate erorile aparute.

### Probleme identificate si rezolvate

- build-ul frontend in workflow a esuat initial
  - solutie: imaginea frontend a fost aliniata pe `node:20-alpine`

- rollout-ul backend-ului in GKE a expirat
  - solutie: deployment-ul backend a fost actualizat cu `strategy: Recreate`

### Rezultat

Pipeline-ul `CI/CD` a fost configurat astfel incat modificarile impinse in repository sa poata fi validate si apoi distribuite automat in infrastructura `GKE`.

### Spatii pentru capturi de ecran

- Fig. 17 - [INSEREAZA SCREENSHOT CU PAGINA REPOSITORY VARIABLES DIN GITHUB]
- Fig. 18 - [INSEREAZA SCREENSHOT CU PAGINA REPOSITORY SECRETS DIN GITHUB]
- Fig. 19 - [INSEREAZA SCREENSHOT CU PROIECTUL DIN GOOGLE CLOUD]
- Fig. 20 - [INSEREAZA SCREENSHOT CU ARTIFACT REGISTRY]
- Fig. 21 - [INSEREAZA SCREENSHOT CU CLUSTERUL GKE]
- Fig. 22 - [INSEREAZA SCREENSHOT CU WORKFLOW-UL CI IN GITHUB ACTIONS]
- Fig. 23 - [INSEREAZA SCREENSHOT CU WORKFLOW-UL CD GCP GKE IN GITHUB ACTIONS]
- Fig. 24 - [INSEREAZA SCREENSHOT CU DEPLOYMENT-UL REUSIT IN GKE]

## Concluzii Finale

Prin parcurgerea lucrarilor de laborator 1-4 a fost realizat un flux complet de dezvoltare, containerizare, orchestrare si automatizare pentru aplicatia `NexumDesk`.

Pe parcursul lucrarilor au fost atinse urmatoarele obiective:

- dezvoltarea unei aplicatii reale, functionale si documentate
- containerizarea aplicatiei cu `Docker`
- rularea aplicatiei in `Kubernetes`
- asigurarea persistentei datelor
- configurarea unui pipeline `CI/CD`
- integrarea cu `Google Cloud` si `GKE`

In concluzie, proiectul demonstreaza implementarea practica a etapelor moderne de dezvoltare si livrare software, de la aplicatie locala pana la deployment automatizat in cloud.

## Observatie Pentru Editarea Finala

Inainte de predare este recomandat:

1. sa inlocuiesti toate textele de tip `[INSEREAZA SCREENSHOT ...]` cu imaginile reale
2. sa numerotezi figurile exact cum apar in documentul final
3. sa completezi, daca este necesar, cu data executarii si numele autorului
4. sa adaptezi formularile daca profesorul a denumit diferit temele lucrarilor 1-4 in PDF
