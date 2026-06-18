output "email_cleanup_queue_url" {
  value = aws_sqs_queue.email_cleanup.url
}

output "email_cleanup_dlq_url" {
  value = aws_sqs_queue.email_cleanup_dlq.url
}
