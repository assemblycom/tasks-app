import { cn } from '@/utils/twMerge'
import { Toggle } from 'copilot-design-system'

type CopilotToggleProps = {
  label: string
  onChange: () => void
  checked: boolean
  disabled?: boolean
} & React.HTMLAttributes<HTMLDivElement>

export const CopilotToggle = ({ label, onChange, checked, className, disabled }: CopilotToggleProps) => {
  return (
    <div className={cn('copilot-toggle-wrapper', className)}>
      <Toggle label={label} onChange={onChange} checked={checked} disabled={disabled} />
    </div>
  )
}
