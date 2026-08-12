import { AssigneeType } from '@prisma/client'
import { BaseService } from '@api/core/services/base.service'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { z } from 'zod'
import { Label as PrismaLabelMapping } from '@prisma/client'
import { ClientResponse, CompanyResponse } from '@/types/common'

export class LabelMappingService extends BaseService {
  /**
   * This method returns the computed label
   * @param assigneeId
   * @param assigneeType
   * @returns string | null
   */
  async getLabel(userIds: { internalUserId: string | null; clientId: string | null; companyId: string | null }) {
    const { internalUserId, clientId, companyId } = userIds
    if (!internalUserId && !clientId && !companyId) {
      const existingLabel = await this.db.label.findFirst({
        where: {
          labelledEntity: 'Unassigned',
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
      if (!existingLabel) {
        const label = 'NOA-001'
        await this.insertLabelMapping(label, 'Unassigned')
        return 'NOA-001'
      }
      const newLabel = `NOA-${this.getNextLabelCount(existingLabel.label)}`
      await this.insertLabelMapping(newLabel, 'Unassigned')
      return newLabel
    }

    if (internalUserId) {
      const workspace = await this.copilot.getWorkspace()
      return await this.generateLabel(z.string().parse(workspace.brandName))
    }
    if (clientId) {
      let client: ClientResponse, company: CompanyResponse
      if (companyId) {
        ;[client, company] = await Promise.all([this.copilot.getClient(clientId), this.copilot.getCompany(companyId)])
      } else {
        client = await this.copilot.getClient(clientId)
        company = await this.copilot.getCompany(client.companyId)
      }
      //client is not assigned in a company
      if (company.isPlaceholder) {
        return await this.generateLabel(client.givenName)
      }
      return await this.generateLabel(company.name)
    }
    if (companyId) {
      const company = await this.copilot.getCompany(companyId)
      return await this.generateLabel(company.name)
    }
  }

  /**
   * This method computes the label string from the given labelledEntity.
   * @param labelledEntity Entity from which label is generated. This should be workspace.brandName for task assigned to IU,
   * company.name for task assigned to client or company. If client isn't assigned to any company (i.e. client is assigned to placeholder company),
   * then this should be client.givenName
   * @returns string
   */
  private async generateLabel(labelledEntity: string) {
    //baseLabel is the first 3 substring of the labelledEntity
    const baseLabel = labelledEntity?.substring(0, 3).toUpperCase()

    //find the latest updated LabelMapping for the given labelledEntity
    const existingLabelWithCurrentLabelEntity = await this.db.label.findFirst({
      where: {
        labelledEntity,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    //find all the LabelMapping that starts with the baseLabel substring
    const existingLabelWithSameBaseLabel = await this.db.label.findMany({
      where: {
        label: {
          startsWith: baseLabel,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    //case I -> if no items are found with the baseLabel. In this case, existingLabelWithSameBaseLabel is also undefined
    if (existingLabelWithSameBaseLabel.length === 0) {
      const label = `${baseLabel}-001`
      await this.insertLabelMapping(label, labelledEntity)
      return label
    }

    //case II -> if existingLabelWithCurrentLabelEntity is undefined but there are existingLabelWithSameBaseLabel
    if (!existingLabelWithCurrentLabelEntity && existingLabelWithSameBaseLabel.length > 0) {
      //suffixNumber is the number assigned to conflicting labels. for ex: OUT2-001 where 2 is suffix number
      //The line below finds the highest suffix number from the existingLabelWithCurrentLabelEntity. If no suffixNumber is found then it returns null.
      const suffixNumber = this.extractLabelSuffixNumber(
        this.findLabelMappingWithHighestSuffix(existingLabelWithSameBaseLabel).label,
      )
      const currentBaseLabel = `${baseLabel}${suffixNumber ? Number(suffixNumber) + 1 : '2'}`
      const newLabel = `${currentBaseLabel}-001`
      await this.insertLabelMapping(newLabel, labelledEntity)
      return newLabel
    }

    //case III -> if both existingLabelWithSameBaseLabel and existingLabelWithCurrentLabelEntity are truthy
    if (existingLabelWithCurrentLabelEntity && existingLabelWithSameBaseLabel.length > 0) {
      const newLabel = `${existingLabelWithCurrentLabelEntity.label.split('-')[0]}-${this.getNextLabelCount(existingLabelWithCurrentLabelEntity.label)}`
      await this.insertLabelMapping(newLabel, labelledEntity)
      return newLabel
    }
  }

  /**
   * This method finds the LabelMapping with the highest suffix.
   * ex: [{label: "COP1-001"}, {label: "COP2-002"}] will return {label: "COP2-002"} where 2 is the highest suffix
   * @param labels PrismaLabelMapping[]
   * @returns PrismaLabelMapping
   */
  private findLabelMappingWithHighestSuffix(labels: PrismaLabelMapping[]) {
    return labels.reduce((maxLabel, currentLabel) => {
      const maxSuffix = this.extractLabelSuffixNumber(maxLabel.label) || 0
      const currentSuffix = this.extractLabelSuffixNumber(currentLabel.label) || 0
      return currentSuffix > maxSuffix ? currentLabel : maxLabel
    }, labels[0])
  }

  /**
   * This method returns the next count of the label ex: if COP-005 is passed it returns 006
   * @param label
   * @returns string
   */
  private getNextLabelCount(label: string) {
    let str = label.split('-')[1]

    // let num = parseInt(str, 10)

    // num += 1
    const num = +str + 1

    let incrementedStr = num.toString().padStart(str.length, '0')

    return incrementedStr
  }

  /**
   * This method extracts the suffix number from the label ex: COP22-010  returns  22
   * @param label
   * @returns string
   */
  private extractLabelSuffixNumber(label: string) {
    const match = label.match(/[A-Z]+(\d+)-\d+/)
    return match?.[1] ?? null
  }

  private async insertLabelMapping(label: string, labelledEntity: string) {
    await this.db.label.create({
      data: {
        label,
        labelledEntity,
      },
    })
  }
}
