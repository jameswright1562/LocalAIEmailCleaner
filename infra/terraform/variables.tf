variable "project_name" {
  type        = string
  description = "Prefix used for local infrastructure resource names."
  default     = "localai"
}

variable "aws_region" {
  type        = string
  description = "AWS-compatible region used by LocalStack."
  default     = "eu-west-2"
}

variable "localstack_endpoint" {
  type        = string
  description = "LocalStack edge endpoint reachable from the Terraform container."
  default     = "http://localstack:4566"
}
