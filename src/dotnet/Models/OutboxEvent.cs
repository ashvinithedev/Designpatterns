using System;
using System.Text.Json.Serialization;

namespace OutboxPattern.Models
{
    public class OutboxEvent
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("messageId")]
        public string MessageId { get; set; }

        [JsonPropertyName("type")]
        public string Type { get; set; } = "OutboxEvent";

        [JsonPropertyName("eventType")]
        public string EventType { get; set; }

        [JsonPropertyName("payload")]
        public string Payload { get; set; }

        [JsonPropertyName("createdAt")]
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        [JsonPropertyName("partitionKey")]
        public string PartitionKey { get; set; }

        [JsonPropertyName("ttl")]
        public int Ttl { get; set; } = 86400; // 24 hours in seconds
    }
}
