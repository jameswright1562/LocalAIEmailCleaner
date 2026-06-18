terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.83"
    }
  }
}

provider "aws" {
  region                      = var.aws_region
  access_key                  = "test"
  secret_key                  = "test"
  s3_use_path_style           = true
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    sqs = var.localstack_endpoint
  }
}

resource "aws_sqs_queue" "email_cleanup_dlq" {
  name                      = "${var.project_name}-email-cleanup-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "email_cleanup" {
  name                       = "${var.project_name}-email-cleanup"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 10

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.email_cleanup_dlq.arn
    maxReceiveCount     = 5
  })
}
