# Technical Specification: Transactional Outbox Pattern

## 1. Overview
This document outlines the technical implementation of the **Transactional Outbox Pattern** using Azure Cosmos DB, Azure Functions, and Azure Service Bus. This pattern is critical for maintaining data consistency in microservices architectures by ensuring that database updates and message publishing are performed atomically.

## 2. Problem Statement
In distributed systems, a common challenge is the "dual-write" problem:
1. A service updates its local database.
2. The service then attempts to notify other systems via a message broker.
If the service crashes or the network fails between these two steps, the system enters an inconsistent state (database updated, but no event sent).

## 3. Proposed Solution
The Transactional Outbox pattern solves this by:
- Writing the **Business Entity** and the **Outbox Event** to the same database within a single transaction.
- Using a separate **Relay** process (Azure Function) to monitor the database's Change Feed and forward events to the message broker.

---

## 4. Architecture Components

### 4.1. Atomic Writer (.NET Service)
- **Responsibility**: Persists state and events.
- **Technology**: C# / .NET with `Microsoft.Azure.Cosmos` SDK.
- **Key Feature**: `TransactionalBatch`. This ensures that both the `Order` and the `OutboxEvent` are committed together.
- **Partitioning Strategy**: Both documents share the same `partitionKey` (e.g., `OrderId` or `CustomerId`) to reside in the same physical partition, which is a prerequisite for Cosmos DB transactions.

### 4.2. Data Store (Azure Cosmos DB)
- **Container**: `Orders`
- **Partition Key**: `/partitionKey`
- **Business Document**: `Order` (Type: "Order")
- **Outbox Document**: `OutboxEvent` (Type: "OutboxEvent")
- **Retention**: Outbox records use a **24-hour TTL** (`ttl` property) for automatic purging after processing, preventing storage bloat.

### 4.3. The Relay (Azure Function)
- **Responsibility**: Asynchronous event forwarding.
- **Technology**: Azure Functions (Isolated Worker Model).
- **Trigger**: `CosmosDBTrigger` (Change Feed).
- **Output**: `ServiceBusOutput` binding.
- **Reliability**: 
  - **Managed Identity**: Uses `DefaultAzureCredential` for secure, passwordless connections.
  - **Duplicate Detection**: Maps the unique `MessageId` from the Outbox record to the Service Bus `MessageId`.
  - **Retry Policy**: Exponential backoff (5 retries, starting at 5s).

---

## 5. Technical Implementation Details

### 5.1. Data Models
#### Order (Business Entity)
Includes standard business fields and metadata:
- `id`: Unique identifier.
- `partitionKey`: Logical partition identifier.
- `_etag`: Used for Optimistic Concurrency Control (OCC).
- `type`: Discriminator set to "Order".

#### OutboxEvent (Metadata)
- `messageId`: Unique ID for the message (used for deduplication).
- `payload`: Serialized JSON of the business entity.
- `createdAt`: Unix timestamp for ordering.
- `ttl`: Set to 86400 (24 hours).

### 5.2. Concurrency & Ordering
- **Optimistic Concurrency**: The `OrderService` implements ETag checks during updates. If the ETag has changed since the record was read, the transaction fails, preventing data corruption.
- **Event Ordering**: The `createdAt` timestamp (long) is used to maintain the sequence of events per partition.

---

## 6. Security & Compliance
- **Authentication**: Strictly uses **Azure Managed Identity**. No connection strings or secrets are stored in configuration.
- **Authorization**: Role-Based Access Control (RBAC) is required:
  - `Cosmos DB Built-in Data Contributor` for the Web API and Function.
  - `Azure Service Bus Data Sender` for the Function.
- **Data at Rest**: Encrypted by default via Azure Cosmos DB service-managed keys.

---

## 7. Operational Considerations
### 7.1. Monitoring
- **Structured Logging**: Uses `ILogger` to log "Message Relayed" status with `MessageId` and `EventType`.
- **Application Insights**: Recommended for tracking Change Feed lag and Function execution health.

### 7.2. Scalability
- **Change Feed**: Scales horizontally as the number of physical partitions in Cosmos DB increases.
- **Lease Management**: The `leases` container manages the state of the Change Feed processor, allowing multiple instances of the Function to distribute the load.

---

## 8. Conclusion
This implementation provides an enterprise-grade solution for reliable event-driven communication. By leveraging Cosmos DB's native transactional capabilities and the serverless scale of Azure Functions, it ensures high availability and strict data consistency.
