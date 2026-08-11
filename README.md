# SyncFlow Monorepo

Plataforma de alta disponibilidade para inscrições e assinaturas de eventos esportivos.

## 🏗️ Estrutura do Monorepo

O projeto utiliza **Turborepo** para gerenciar os pacotes e aplicações de forma integrada:

- `apps/web`: Frontend desenvolvido em **Astro (SSR-first)** com React e Tailwind CSS v4.
- `apps/api`: Backend principal desenvolvido em **NestJS** seguindo a arquitetura **DDD (Domain-Driven Design)** e integração com o Prisma ORM.
- `packages/workers`: Processo isolado **Node.js** para processar tarefas assíncronas em segundo plano utilizando **BullMQ**.
- `packages/shared`: Biblioteca de tipos compartilhados, constantes e esquemas de validação comuns a todo o monorepo.

---

## 🛠️ Requisitos

Antes de iniciar, certifique-se de ter instalado:

- **Node.js** >= 20.0.0
- **Docker** e **Docker Compose**
- **npm** (gerenciador de pacotes padrão)

---

## 🚀 Como Iniciar o Desenvolvimento

### 1. Instalar as Dependências

Na raiz do monorepo (`syncflow/`), execute:

```bash
npm install
```

Este comando instalará todos os pacotes das aplicações e executará o `postinstall` para gerar o **Prisma Client** com base no schema da API.

### 2. Configurar Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env` e preencha as variáveis de ambiente necessárias para a integração do banco de dados (Supabase), autenticação (Clerk), filas (Upstash Redis) e gateway de pagamentos (Asaas).

```bash
cp .env.example .env
```

### 3. Subir Serviços Auxiliares locais (PostgreSQL & Redis)

Se desejar executar um banco e filas locais para desenvolvimento ou testes, suba o container Docker:

```bash
docker compose up -d
```

### 4. Rodar o Ambiente de Desenvolvimento

Para rodar todas as aplicações (Astro, NestJS e Workers) simultaneamente em modo de desenvolvimento:

```bash
npm run dev
```

---

## 🧪 Testes & Cobertura

O projeto adota uma política rígida de **100% de cobertura de código**. Todos os novos códigos devem ter testes unitários ou de integração associados.

- Para executar a suite completa de testes em todo o monorepo:
  ```bash
  npm run test
  ```
- Para rodar os testes específicos dos Workers (com Vitest):
  ```bash
  npm run test --workspace=@syncflow/workers
  ```
- Para rodar os testes específicos da API (com Jest):
  ```bash
  npm run test --workspace=api
  ```

---

## 📦 Builds

Para compilar todo o monorepo utilizando cache incremental do Turborepo:

```bash
npm run build
```

---