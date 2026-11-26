from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

class DemoLogin(Input):
    persona: Literal['demo_admin', 'demo_other_admin'] = 'demo_admin'

class CompanyInput(Input):
    name: str = Field(min_length=2, max_length=100)

    @field_validator('name')
    @classmethod
    def trim_name(cls, value):
        value = ' '.join(value.split())
        if len(value) < 2:
            raise ValueError('Укажите имя от 2 символов.')
        return value

class ConnectInput(CompanyInput):
    tariffId: Literal['start', 'plus']

class SubscriptionInput(Input):
    tariffId: Literal['start', 'plus']

class EmployeeInput(CompanyInput):
    role: Literal['company_admin', 'company_employee'] = 'company_employee'

class EmployeePatch(Input):
    role: Literal['company_admin', 'company_employee'] | None = None
    status: Literal['active', 'disabled'] | None = None

class LimitInput(Input):
    employeeId: str = Field(min_length=1, max_length=36)
    code: Literal['shipping', 'packaging']
    enabled: bool
    limitKopecks: int = Field(ge=0, le=400000)

class UsageInput(Input):
    code: Literal['shipping', 'packaging']
    originalKopecks: int = Field(gt=0, le=100000000)
    requestKey: str = Field(min_length=1, max_length=100, pattern=r'^\S+$')

class ResetInput(Input):
    companyId: str = Field(min_length=1, max_length=36)
