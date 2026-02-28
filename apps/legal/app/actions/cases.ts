import { logger } from '@zenowethu/shared-lib';
'use server'

import { auth } from "@zenowethu/shared-lib"
import { prisma } from "@zenowethu/database"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"

// Schema for case creation
const CreateCaseSchema = z.object({
    fileNumber: z.string().min(1, "File number is required"),
    clientFirstName: z.string().min(1, "First name is required"),
    clientLastName: z.string().min(1, "Last name is required"),
    clientIdNumber: z.string().min(13, "ID Number must be at least 13 characters"),
    description: z.string().optional(),
    matterType: z.string().min(1, "Matter type is required"),
    creditorName: z.string().min(1, "Creditor name is required"),
    accountNumber: z.string().optional() })

export async function createLegalCase(formData: FormData) {
    const session = await auth()

    if (!session?.user?.id) {
        return { error: "Unauthorized" }
    }

    const rawData = {
        fileNumber: formData.get('fileNumber'),
        clientFirstName: formData.get('clientFirstName'),
        clientLastName: formData.get('clientLastName'),
        clientIdNumber: formData.get('clientIdNumber'),
        description: formData.get('description'),
        matterType: formData.get('matterType'),
        creditorName: formData.get('creditorName'),
        accountNumber: formData.get('accountNumber') }

    const validatedFields = CreateCaseSchema.safeParse(rawData)

    if (!validatedFields.success) {
        return { error: "Invalid fields", details: validatedFields.error.flatten().fieldErrors }
    }

    const {
        fileNumber,
        clientFirstName,
        clientLastName,
        clientIdNumber,
        description,
        matterType,
        creditorName,
        accountNumber
    } = validatedFields.data

    try {
        // 1. Find or create client
        let client = await prisma.client.findUnique({
            where: { idNumber: clientIdNumber }
        })

        if (!client) {
            client = await prisma.client.create({
                data: {
                    firstName: clientFirstName,
                    lastName: clientLastName,
                    idNumber: clientIdNumber }
            })
        }

        // 2. Create the Case
        const newCase = await prisma.case.create({
            data: {
                fileNumber,
                clientId: client.id,
                category: "LEGAL",
                status: "OPEN",
                description: description || `Legal Matter - ${matterType}`,
                createdById: session.user.id,

                // Create the linked LegalMatter immediately
                LegalMatter: {
                    create: {
                        clientId: client.id,
                        matterType,
                        creditorName,
                        accountNumber,
                        status: "OPEN",
                        createdById: session.user.id }
                },

                // Log the creation
                workflowLogs: {
                    create: {
                        action: "CASE_CREATED",
                        toStatus: "OPEN",
                        userId: session.user.id,
                        notes: "Case created via Legal App"
                    }
                }
            }
        })

        revalidatePath('/cases')
        return { success: true, caseId: newCase.id }

    } catch (error: any) {
        logger.error("Failed to create legal case:", error)
        if (error.code === 'P2002') {
            return { error: "A case with this file number already exists." }
        }
        return { error: "Failed to create case. Please try again." }
    }
}
