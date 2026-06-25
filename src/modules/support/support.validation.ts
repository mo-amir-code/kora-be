import { z } from "zod";

export const submitInquirySchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    category: z.string().min(1, "Category is required"),
    subject: z.string().min(1, "Subject is required"),
    message: z.string().min(1, "Message is required"),
  }),
});

export type SubmitInquiryBody = z.infer<typeof submitInquirySchema>["body"];
